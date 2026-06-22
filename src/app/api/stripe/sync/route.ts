import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { calculateTax } from "@/lib/tax/rates";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.stripeConnection.findUnique({
    where: { userId: session.user.id },
  });
  if (!connection) {
    return NextResponse.json({ error: "No Stripe account connected" }, { status: 400 });
  }

  try {
    const stripe = getStripeClient();
    const charges = await stripe.charges.list(
      { limit: 100 },
      { stripeAccount: connection.stripeAccountId }
    );

    let synced = 0;
    for (const charge of charges.data) {
      const existing = await prisma.transaction.findUnique({
        where: { stripeChargeId: charge.id },
      });
      if (existing) continue;

      const billing = charge.billing_details;
      const shipping = charge.shipping;
      const address = shipping?.address || billing?.address || null;
      const country = address?.country || "US";
      const state = address?.state || null;

      const taxResult = calculateTax(charge.amount, country, state);

      await prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            userId: session.user.id,
            stripeChargeId: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            customerName: billing?.name || null,
            customerEmail: billing?.email || null,
            customerCountry: country,
            customerState: state,
            customerZip: address?.postal_code || null,
            customerCity: address?.city || null,
            description: charge.description || null,
            metadata: JSON.stringify({
              created: new Date(charge.created * 1000).toISOString(),
            }),
            createdAt: new Date(charge.created * 1000),
          },
        });

        if (taxResult.rate) {
          await tx.taxCalculation.create({
            data: {
              transactionId: txn.id,
              userId: session.user.id,
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
      synced++;
    }

    return NextResponse.json({ synced, total: charges.data.length });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error.message || "Sync failed" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
