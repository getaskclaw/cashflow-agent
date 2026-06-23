import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, webhookSecret!);
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const invoiceNumber = session.client_reference_id || session.metadata?.invoiceNumber;

        if (!invoiceNumber) {
          console.warn("Webhook: no invoiceNumber in session metadata", session.id);
          break;
        }

        const invoice = await prisma.invoice.findUnique({
          where: { invoiceNumber },
        });

        if (!invoice) {
          console.warn(`Webhook: invoice ${invoiceNumber} not found`);
          break;
        }

        if (invoice.status === "paid") {
          // Already paid, skip
          break;
        }

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "paid",
            paidAt: new Date(),
            stripePaymentId: session.payment_intent || session.id,
          },
        });

        // Also record as a transaction for the cashflow board
        const userId = invoice.userId;
        await prisma.transaction.upsert({
          where: { stripeChargeId: session.payment_intent || session.id },
          update: {
            amount: session.amount_total || invoice.amount,
            currency: session.currency || "usd",
            customerName: invoice.customerId
              ? (await prisma.customer.findUnique({ where: { id: invoice.customerId } }))?.name
              : null,
          },
          create: {
            userId,
            stripeChargeId: session.payment_intent || session.id,
            amount: session.amount_total || invoice.amount,
            currency: session.currency || "usd",
            customerName: invoice.customerId
              ? (await prisma.customer.findUnique({ where: { id: invoice.customerId } }))?.name
              : null,
            createdAt: new Date(),
          },
        });

        console.log(`Webhook: invoice ${invoiceNumber} marked as paid`);
        break;
      }

      case "checkout.session.expired": {
        const expiredSession = event.data.object as any;
        const invNumber = expiredSession.client_reference_id || expiredSession.metadata?.invoiceNumber;
        if (invNumber) {
          console.log(`Webhook: payment link expired for invoice ${invNumber}`);
        }
        break;
      }

      default:
        console.log(`Webhook: unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
