import Stripe from "stripe";

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as const });
}

export function getStripeConnectUrl(userId: string): string {
  const clientId = process.env.STRIPE_CLIENT_ID;
  if (!clientId) throw new Error("STRIPE_CLIENT_ID not set");

  const base = "https://connect.stripe.com/oauth/authorize";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state: userId,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/stripe/oauth-callback`,
  });
  return `${base}?${params.toString()}`;
}
