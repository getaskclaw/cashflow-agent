"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";

interface DashboardData {
  connected: boolean;
  stripeAccountId: string | null;
  stats: {
    totalRevenueCents: number;
    totalTaxCents: number;
    transactionCount: number;
    taxCalculatedCount: number;
  };
  transactions: {
    id: string;
    amount: number;
    currency: string;
    customerName: string | null;
    customerCountry: string | null;
    createdAt: string;
    taxCalculation: {
      jurisdictionName: string;
      jurisdictionCode: string;
      taxRate: number;
      taxAmount: number;
      status: string;
    } | null;
  }[];
}

function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/stripe/sync", { method: "POST" });
      const result = await res.json();
      // Reload dashboard data
      const dash = await fetch("/api/dashboard").then((r) => r.json());
      setData(dash);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div style={{ textAlign: "center", padding: 80, color: "var(--text-dim)" }}>
          Loading...
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "24px" }}>
        {/* Stripe Connection Status */}
        <div
          style={{
            background: data?.connected ? "var(--surface)" : "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
              Stripe Connection
            </h2>
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>
              {data?.connected
                ? `Connected to account ${data.stripeAccountId?.slice(0, 12)}...`
                : "Connect your Stripe account to start tracking taxes"}
            </p>
          </div>
          {data?.connected ? (
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                padding: "10px 20px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: syncing ? "not-allowed" : "pointer",
                opacity: syncing ? 0.6 : 1,
              }}
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
          ) : (
            <a
              href="/connect-stripe"
              style={{
                background: "var(--accent)",
                color: "#fff",
                padding: "10px 20px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Connect Stripe
            </a>
          )}
        </div>

        {/* Stats Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 16,
            marginBottom: 32,
          }}
        >
          {[
            {
              label: "Transactions",
              value: data?.stats.transactionCount || 0,
              suffix: "",
            },
            {
              label: "Total Revenue",
              value: formatCents(data?.stats.totalRevenueCents || 0),
              suffix: "",
            },
            {
              label: "Tax Calculated",
              value: formatCents(data?.stats.totalTaxCents || 0),
              suffix: "",
            },
            {
              label: "Jurisdictions",
              value: data?.stats.taxCalculatedCount || 0,
              suffix: "",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "16px 20px",
              }}
            >
              <div
                style={{
                  color: "var(--text-dim)",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 4,
                }}
              >
                {stat.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {stat.value}
                {stat.suffix}
              </div>
            </div>
          ))}
        </div>

        {/* Transaction List */}
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Recent Transactions
        </h2>
        {data?.transactions && data.transactions.length > 0 ? (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-dim)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>
                    Date
                  </th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>
                    Customer
                  </th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>
                    Country
                  </th>
                  <th style={{ textAlign: "right", padding: "10px 16px" }}>
                    Amount
                  </th>
                  <th style={{ textAlign: "right", padding: "10px 16px" }}>
                    Tax
                  </th>
                  <th style={{ textAlign: "right", padding: "10px 16px" }}>
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      fontSize: 13,
                    }}
                  >
                    <td style={{ padding: "10px 16px" }}>
                      {formatDate(tx.createdAt)}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {tx.customerName || "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {tx.customerCountry || "—"}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      {formatCents(tx.amount, tx.currency)}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        textAlign: "right",
                        color: tx.taxCalculation
                          ? "var(--amber)"
                          : "var(--text-dim)",
                      }}
                    >
                      {tx.taxCalculation
                        ? formatCents(tx.taxCalculation.taxAmount)
                        : "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        textAlign: "right",
                      }}
                    >
                      {tx.taxCalculation
                        ? `${(tx.taxCalculation.taxRate * 100).toFixed(2)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 40,
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: 14,
            }}
          >
            {data?.connected
              ? "No transactions found. Click Sync Now to pull your Stripe data."
              : "Connect your Stripe account to see your transactions."}
          </div>
        )}
      </main>
    </>
  );
}
