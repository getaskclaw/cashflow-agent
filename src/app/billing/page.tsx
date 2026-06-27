"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";

interface SubData {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  invoiceCount: number;
  invoiceLimit: number;
  planLabel: string;
  planPrice: number;
}

const PLAN_COLORS: Record<string, string> = {
  free: "var(--text-muted)",
  starter: "var(--green)",
  pro: "var(--accent)",
  business: "var(--amber)",
};

export default function BillingPage() {
  const { data: session, status } = useSession();
  const [sub, setSub] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/stripe/subscription")
        .then((r) => r.json())
        .then((d) => setSub(d))
        .catch(() => setError("Failed to load subscription"))
        .finally(() => setLoading(false));
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status]);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message);
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <main style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
          <p style={{ color: "var(--text-dim)" }}>Loading...</p>
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Header />
        <main style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--text-dim)" }}>Please sign in to view billing.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 32 }}>Billing</h1>

        {error && (
          <div
            style={{
              background: "var(--red)15",
              border: "1px solid var(--red)40",
              borderRadius: 10,
              padding: "12px 16px",
              color: "var(--red)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        {sub && (
          <>
            {/* Current Plan Card */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 28,
                marginBottom: 24,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 4 }}>Current Plan</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <h2 style={{ fontSize: 24, fontWeight: 800 }}>{sub.planLabel}</h2>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: PLAN_COLORS[sub.plan] || "var(--text-dim)",
                        background: (PLAN_COLORS[sub.plan] || "var(--text-dim)") + "22",
                        padding: "2px 10px",
                        borderRadius: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {sub.status}
                    </span>
                  </div>
                  <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 4 }}>
                    ${sub.planPrice}/month
                  </p>
                </div>
              </div>

              {/* Usage */}
              <div
                style={{
                  background: "var(--bg)",
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Invoices used</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {sub.invoiceCount}
                    {sub.invoiceLimit === -1 ? "" : ` / ${sub.invoiceLimit}`}
                  </span>
                </div>
                {sub.invoiceLimit !== -1 && (
                  <div
                    style={{
                      height: 6,
                      background: "var(--border)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, (sub.invoiceCount / sub.invoiceLimit) * 100)}%`,
                        background: sub.invoiceCount >= sub.invoiceLimit ? "var(--red)" : "var(--accent)",
                        borderRadius: 3,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                )}
                {sub.invoiceLimit === -1 && (
                  <p style={{ fontSize: 12, color: "var(--green)", margin: "4px 0 0 0" }}>
                    ∞ Unlimited invoices
                  </p>
                )}
              </div>

              {/* Renews / Cancels */}
              {sub.currentPeriodEnd && (
                <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
                  {sub.cancelAtPeriodEnd
                    ? `Access ends on ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
                    : `Renews on ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {sub.plan !== "free" && (
                  <button
                    onClick={openPortal}
                    disabled={portalLoading}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border-light)",
                      color: "var(--text)",
                      padding: "10px 20px",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      opacity: portalLoading ? 0.6 : 1,
                    }}
                  >
                    {portalLoading ? "Loading..." : "Manage Subscription"}
                  </button>
                )}
                <a
                  href="/pricing"
                  style={{
                    display: "inline-block",
                    background: "var(--gradient-accent)",
                    color: "#fff",
                    padding: "10px 20px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {sub.plan === "free" ? "Upgrade" : "Change Plan"}
                </a>
              </div>
            </div>

            {/* Payment method note */}
            {sub.plan === "free" && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 24,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
                <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6 }}>
                  You&apos;re on the Free plan. Upgrade to unlock AI follow-ups, Stripe sync,
                  and higher invoice limits.
                </p>
                <a
                  href="/pricing"
                  style={{
                    display: "inline-block",
                    marginTop: 16,
                    background: "var(--gradient-accent)",
                    color: "#fff",
                    padding: "12px 28px",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  View Plans
                </a>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
