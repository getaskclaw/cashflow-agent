import { prisma } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import type { Subscription as PrismaSubscription } from "@prisma/client";

export type Plan = "free" | "starter" | "pro" | "business";

export const PLAN_LIMITS: Record<Plan, { invoices: number; label: string; price: number }> = {
  free: { invoices: 5, label: "Free", price: 0 },
  starter: { invoices: 50, label: "Starter", price: 29 },
  pro: { invoices: 500, label: "Pro", price: 79 },
  business: { invoices: Infinity, label: "Business", price: 199 },
};

export const PLAN_FEATURES: Record<Plan, string[]> = {
  free: [
    "Up to 5 invoices",
    "Manual follow-up drafting",
    "Basic dashboard",
  ],
  starter: [
    "Up to 50 invoices",
    "AI follow-up drafts",
    "Stripe sync",
    "Basic dashboard",
  ],
  pro: [
    "Up to 500 invoices",
    "Everything in Starter",
    "Reply-aware AI agent",
    "Broken promise alerts",
    "Cashflow forecasting",
    "Priority support",
  ],
  business: [
    "Unlimited invoices",
    "Everything in Pro",
    "Multi-user accounts",
    "Custom AI tone",
    "API access",
    "Dedicated support",
  ],
};

/**
 * Get the price ID for a plan from environment variables.
 */
export function getPriceId(plan: Plan): string | null {
  const map: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    business: process.env.STRIPE_PRICE_BUSINESS,
  };
  return map[plan] ?? null;
}

/**
 * Determine plan from a Stripe price ID.
 */
export function planFromPriceId(priceId: string): Plan {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business";
  return "free";
}

/**
 * Get or create a subscription record for a user.
 * Creates a Stripe Customer if one doesn't exist.
 */
export async function getOrCreateSubscription(userId: string, email: string): Promise<PrismaSubscription> {
  let sub = await prisma.subscription.findUnique({ where: { userId } });

  if (sub) return sub;

  // Create a Stripe customer
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  sub = await prisma.subscription.create({
    data: {
      userId,
      stripeCustomerId: customer.id,
      plan: "free",
      status: "active",
    },
  });

  return sub;
}

/**
 * Get the user's current plan.
 */
export async function getUserPlan(userId: string): Promise<Plan> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return "free";
  return (sub.plan as Plan) || "free";
}

/**
 * Check if user can create more invoices.
 */
export async function canCreateInvoice(userId: string): Promise<{ allowed: boolean; current: number; limit: number; plan: Plan }> {
  const plan = await getUserPlan(userId);
  const limit = PLAN_LIMITS[plan].invoices;

  const current = await prisma.invoice.count({ where: { userId } });

  return {
    allowed: current < limit,
    current,
    limit: limit === Infinity ? -1 : limit,
    plan,
  };
}

/**
 * Create a Stripe Checkout session for upgrading.
 */
export async function createCheckoutSession(userId: string, plan: Plan, email: string): Promise<string> {
  const priceId = getPriceId(plan);
  if (!priceId) throw new Error(`No price ID for plan: ${plan}`);

  const sub = await getOrCreateSubscription(userId, email);
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    customer: sub.stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/billing?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/billing?canceled=true`,
    metadata: { userId, plan },
    subscription_data: {
      metadata: { userId, plan },
    },
  });

  return session.url!;
}

/**
 * Create a Stripe Billing Portal session.
 */
export async function createPortalSession(userId: string): Promise<string> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) throw new Error("No subscription found");

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.NEXTAUTH_URL}/billing`,
  });

  return session.url;
}
