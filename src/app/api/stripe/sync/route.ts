import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";

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

      await prisma.transaction.create({
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
      synced++;
    }

    return NextResponse.json({ synced, total: charges.data.length });
  } catch (error: any) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
