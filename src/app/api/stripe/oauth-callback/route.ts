import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripeClient, verifyStripeState } from "@/lib/stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/connect-stripe?error=${error}`, req.url));
  }

  if (!state || !code) {
    return NextResponse.redirect(new URL("/connect-stripe?error=missing_params", req.url));
  }

  // Verify the signed state nonce
  const userId = verifyStripeState(state);
  if (!userId) {
    return NextResponse.redirect(new URL("/connect-stripe?error=invalid_state", req.url));
  }

  // In production, verify the current session matches the state userId
  if (process.env.NODE_ENV === "production") {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.id !== userId) {
      return NextResponse.redirect(new URL("/connect-stripe?error=session_mismatch", req.url));
    }
  }

  try {
    const stripe = getStripeClient();

    const oauthResponse = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const connectedAccountId = oauthResponse.stripe_user_id;
    if (!connectedAccountId) {
      throw new Error("No stripe_user_id in OAuth response");
    }

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

    await syncTransactions(userId, connectedAccountId);

    return NextResponse.redirect(new URL("/dashboard?connected=true", req.url));
  } catch (error: any) {
    console.error("Stripe OAuth error:", error?.message || error);
    return NextResponse.redirect(new URL("/connect-stripe?error=oauth_failed", req.url));
  }
}

export const dynamic = "force-dynamic";

async function syncTransactions(
  userId: string,
  stripeAccountId: string
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

      // Create transaction record
      await prisma.transaction.create({
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
    }

    return { synced: charges.data.length };
  } catch (error) {
    console.error("Sync error:", error);
    throw error;
  }
}
