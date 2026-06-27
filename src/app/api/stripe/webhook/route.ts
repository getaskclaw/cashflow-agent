import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { planFromPriceId } from "@/lib/subscription";

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — all webhooks will fail");
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 }
      );
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
    } catch {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      // ─── Invoice payment events (existing) ───────────────────
      case "checkout.session.completed": {
        const session = event.data.object as any;

        // Handle subscription checkout (new subscriptions/upgrades)
        if (session.mode === "subscription") {
          const userId = session.metadata?.userId;
          const plan = session.metadata?.plan;

          if (userId) {
            const subscriptionId = session.subscription as string;
            const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

            await prisma.subscription.upsert({
              where: { userId },
              update: {
                stripeSubscriptionId: subscriptionId,
                stripePriceId: stripeSub.items.data[0]?.price?.id || null,
                stripeProductId: stripeSub.items.data[0]?.price?.product as string || null,
                plan: plan || planFromPriceId(stripeSub.items.data[0]?.price?.id || ""),
                status: stripeSub.status,
                currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              },
              create: {
                userId,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: subscriptionId,
                stripePriceId: stripeSub.items.data[0]?.price?.id || null,
                stripeProductId: stripeSub.items.data[0]?.price?.product as string || null,
                plan: plan || planFromPriceId(stripeSub.items.data[0]?.price?.id || ""),
                status: stripeSub.status,
                currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              },
            });

            console.log(`[stripe-webhook] Subscription updated: user=${userId} plan=${plan}`);
            break;
          }
        }

        // Handle one-time invoice payment (existing logic)
        // Read from metadata using consistent field names.
        // The Python script writes invoice_id, invoice_number, customer_name.
        // We support both invoiceNumber and invoice_id for backward compat.
        const invoiceNumber =
          session.metadata?.invoice_number ||
          session.metadata?.invoiceNumber ||
          session.client_reference_id;

        if (!invoiceNumber) {
          console.warn("Webhook: no invoice_number in session metadata", session.id);
          break;
        }

        // Scope the lookup by userId from metadata to prevent cross-user collisions.
        // The schema allows the same invoice number for different users.
        const metadataUserId = session.metadata?.user_id || session.metadata?.userId;

        const invoice = await prisma.invoice.findFirst({
          where: metadataUserId
            ? { userId: metadataUserId, invoiceNumber }
            : { invoiceNumber },
        });

        if (!invoice) {
          console.warn(`Webhook: invoice ${invoiceNumber} not found`);
          break;
        }

        if (invoice.status === "paid") {
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

      // ─── Subscription lifecycle events ───────────────────────
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const stripeSub = event.data.object as any;
        const customerId = stripeSub.customer as string;

        const sub = await prisma.subscription.findUnique({
          where: { stripeCustomerId: customerId },
        });

        if (!sub) {
          console.warn(`[stripe-webhook] No subscription record for customer ${customerId}`);
          break;
        }

        const priceId = stripeSub.items?.data?.[0]?.price?.id || null;
        await prisma.subscription.update({
          where: { userId: sub.userId },
          data: {
            stripeSubscriptionId: stripeSub.id,
            stripePriceId: priceId,
            stripeProductId: stripeSub.items?.data?.[0]?.price?.product || null,
            plan: planFromPriceId(priceId || ""),
            status: stripeSub.status,
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          },
        });

        console.log(`[stripe-webhook] Subscription ${event.type}: user=${sub.userId} status=${stripeSub.status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data.object as any;
        const customerId = stripeSub.customer as string;

        const sub = await prisma.subscription.findUnique({
          where: { stripeCustomerId: customerId },
        });

        if (!sub) break;

        await prisma.subscription.update({
          where: { userId: sub.userId },
          data: {
            plan: "free",
            status: "canceled",
            cancelAtPeriodEnd: false,
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeProductId: null,
          },
        });

        console.log(`[stripe-webhook] Subscription canceled: user=${sub.userId}`);
        break;
      }

      // ─── Customer updates (sync email etc.) ──────────────────
      case "customer.updated": {
        const customer = event.data.object as any;
        // No-op for now — customer data is read on demand
        console.log(`[stripe-webhook] Customer updated: ${customer.id}`);
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
