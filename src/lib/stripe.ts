import Stripe from "stripe";
import crypto from "crypto";

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" as const });
}

/**
 * Generate a signed nonce for Stripe OAuth state.
 * Format: userId.timestamp.hmac
 * The HMAC prevents tampering — an attacker can't forge a state
 * for a different userId without knowing NEXTAUTH_SECRET.
 */
export function getStripeConnectUrl(userId: string): string {
  const clientId = process.env.STRIPE_CLIENT_ID;
  if (!clientId) throw new Error("STRIPE_CLIENT_ID not set");

  const secret = process.env.NEXTAUTH_SECRET || "dev-fallback-secret";
  const timestamp = Date.now();
  const payload = `${userId}.${timestamp}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const state = `${payload}.${hmac}`;

  const base = "https://connect.stripe.com/oauth/authorize";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: "read_write",
    state,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/stripe/oauth-callback`,
  });
  return `${base}?${params.toString()}`;
}

/**
 * Verify the Stripe OAuth state nonce.
 * Returns the userId if valid, null if tampered or expired.
 */
export function verifyStripeState(state: string): string | null {
  const parts = state.split(".");
  if (parts.length < 3) return null;

  const userId = parts[0];
  const timestamp = parseInt(parts[1], 10);
  const hmac = parts.slice(2).join(".");

  const secret = process.env.NEXTAUTH_SECRET || "dev-fallback-secret";
  const payload = `${userId}.${timestamp}`;
  const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(hmac))) {
    return null;
  }

  // Expire after 10 minutes
  if (Date.now() - timestamp > 10 * 60 * 1000) {
    return null;
  }

  return userId;
}
