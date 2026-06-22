import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { calculateTax, getRateForJurisdiction } from "@/lib/tax/rates";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!userId || !code) {
    return NextResponse.redirect(
      new URL("/connect-stripe?error=missing_params", req.url)
    );
  }

  try {
    const stripe = getStripeClient();

    // Exchange authorization code for Stripe access token
    const oauthResponse = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const connectedAccountId = oauthResponse.stripe_user_id;
    if (!connectedAccountId) {
      throw new Error("No stripe_user_id in OAuth response");
    }

    // Store the connection
    await prisma.stripeConnection.upsert({
      where: { userId },
      update: {
        stripeAccountId: connectedAccountId,
        accessToken: oauthResponse.access_token ?? "",
        refreshToken: oauthResponse.refresh_token ?? "",
        stripePublishableKey: oauthResponse.stripe_publishable_key ?? "",
        stripeUserId: oauthResponse.stripe_user_id ?? "",
        livemode: oauthResponse.livemode ?? false,
      },
      create: {
        userId,
        stripeAccountId: connectedAccountId,
        accessToken: oauthResponse.access_token ?? "",
        refreshToken: oauthResponse.refresh_token ?? "",
        stripePublishableKey: oauthResponse.stripe_publishable_key ?? "",
        stripeUserId: oauthResponse.stripe_user_id ?? "",
        livemode: oauthResponse.livemode ?? false,
      },
    });

    // Trigger initial sync
    await syncTransactions(userId, connectedAccountId, oauthResponse.access_token ?? "");

    return NextResponse.redirect(new URL("/dashboard?connected=true", req.url));
  } catch (error) {
    console.error("Stripe OAuth error:", error);
    return NextResponse.redirect(
      new URL("/connect-stripe?error=oauth_failed", req.url)
    );
  }
}

export const dynamic = "force-dynamic";

async function syncTransactions(
  userId: string,
  stripeAccountId: string,
  accessToken: string
) {
  try {
    const stripe = getStripeClient();

    // Use the access token to make requests on behalf of the connected account
    const charges = await stripe.charges.list(
      { limit: 100 },
      { stripeAccount: stripeAccountId }
    );

    for (const charge of charges.data) {
      // Skip if already synced
      const existing = await prisma.transaction.findUnique({
        where: { stripeChargeId: charge.id },
      });
      if (existing) continue;

      const billingDetails = charge.billing_details;
      const shippingDetails = charge.shipping;

      // Determine customer location
      const address = shippingDetails?.address || billingDetails?.address || null;
      const country = address?.country || "US";
      const state = address?.state || null;

      // Calculate tax
      const taxResult = calculateTax(charge.amount, country, state);

      // Create transaction and tax calculation in a transaction
      await prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            userId,
            stripeChargeId: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            customerName: billingDetails?.name || null,
            customerEmail: billingDetails?.email || null,
            customerCountry: country,
            customerState: state,
            customerZip: address?.postal_code || null,
            customerCity: address?.city || null,
            description: charge.description || null,
            metadata: JSON.stringify({
              stripeChargeCreated: new Date(charge.created * 1000).toISOString(),
              paid: charge.paid,
              refunded: charge.refunded,
              paymentMethod: charge.payment_method_details?.type || null,
            }),
            createdAt: new Date(charge.created * 1000),
          },
        });

        if (taxResult.rate) {
          await tx.taxCalculation.create({
            data: {
              transactionId: txn.id,
              userId,
              jurisdictionType: taxResult.rate.jurisdictionType,
              jurisdictionName: taxResult.rate.jurisdictionName,
              jurisdictionCode: taxResult.rate.jurisdictionCode,
              taxRate: taxResult.rate.rate,
              taxAmount: taxResult.taxAmountCents,
              taxableAmount: taxResult.taxableAmountCents,
              stateRate: taxResult.rate.stateRate || null,
              localRate: taxResult.rate.localRate || null,
              countryRate: taxResult.rate.countryRate || null,
              status: "calculated",
            },
          });
        }
      });
    }

    return { synced: charges.data.length };
  } catch (error) {
    console.error("Sync error:", error);
    throw error;
  }
}
