"use client";

import { useSession, signIn } from "next-auth/react";
import { useState } from "react";
import { Header } from "@/components/header";
import { PLAN_FEATURES } from "@/lib/subscription";

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: 0,
    tagline: "Try it out",
    cta: "Current plan",
    highlight: false,
  },
  {
    id: "starter" as const,
    name: "Starter",
    price: 29,
    tagline: "For solo founders",
    cta: "Upgrade to Starter",
    highlight: false,
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: 79,
    tagline: "For growing teams",
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    id: "business" as const,
    name: "Business",
    price: 199,
    tagline: "For established businesses",
    cta: "Upgrade to Business",
    highlight: false,
  },
];

export default function PricingPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleUpgrade(plan: string) {
    if (!session) {
      signIn();
      return;
    }

    setLoading(plan);
    setError("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setLoading(null);
    }
  }

  return (
    <>
      <Header />
      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "60px 24px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-0.5px",
              marginBottom: 12,
            }}
          >
            Simple, transparent pricing
          </h1>
          <p
            style={{
              color: "var(--text-dim)",
              fontSize: 16,
              maxWidth: 500,
              margin: "0 auto",
            }}
          >
            Start free. Upgrade when you&apos;re ready. Cancel anytime.
          </p>
        </div>

        {error && (
          <div
            style={{
              textAlign: "center",
              color: "var(--red)",
              marginBottom: 24,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            maxWidth: 1000,
            margin: "0 auto",
          }}
        >
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: plan.highlight
                  ? "linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%)"
                  : "var(--surface)",
                border: plan.highlight
                  ? "1px solid var(--accent)"
                  : "1px solid var(--border)",
                borderRadius: 16,
                padding: 28,
                position: "relative",
                boxShadow: plan.highlight ? "var(--shadow-glow)" : "var(--shadow-sm)",
              }}
            >
              {plan.highlight && (
                <span
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--gradient-accent)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 14px",
                    borderRadius: 12,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  Most Popular
                </span>
              )}

              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  marginBottom: 4,
                }}
              >
                {plan.name}
              </h3>
              <p
                style={{
                  color: "var(--text-muted)",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                {plan.tagline}
              </p>

              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 36, fontWeight: 900 }}>${plan.price}</span>
                <span style={{ color: "var(--text-dim)", fontSize: 14 }}>/mo</span>
              </div>

              <button
                onClick={() => plan.id !== "free" && handleUpgrade(plan.id)}
                disabled={loading === plan.id || plan.id === "free"}
                style={{
                  width: "100%",
                  background: plan.highlight ? "var(--gradient-accent)" : "var(--surface-2)",
                  border: plan.highlight ? "none" : "1px solid var(--border-light)",
                  color: plan.id === "free" ? "var(--text-muted)" : "#fff",
                  padding: "12px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: plan.id === "free" ? "default" : "pointer",
                  opacity: loading === plan.id ? 0.6 : 1,
                  marginBottom: 24,
                }}
              >
                {loading === plan.id ? "Redirecting..." : plan.cta}
              </button>

              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {PLAN_FEATURES[plan.id].map((feature, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 13,
                      color: "var(--text-dim)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: "var(--green)", flexShrink: 0, marginTop: 1 }}>
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p
          style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
            marginTop: 40,
          }}
        >
          Secure payment via Stripe. Cancel anytime from your billing portal.
        </p>
      </main>
    </>
  );
}
