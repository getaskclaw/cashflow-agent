"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  dueDate: string;
  promiseDate: string | null;
  paidAt: string | null;
  customer: { name: string; email: string };
  lastCommunication: { content: string; direction: string; createdAt: string } | null;
}

interface DashboardData {
  connected: boolean;
  stripeAccountId: string | null;
  cashflow: {
    expectedThisWeek: number;
    overdue: number;
    collectedThisWeek: number;
    atRisk: number;
  };
  invoices: Invoice[];
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "paid": return "var(--green)";
    case "overdue": return "var(--danger)";
    case "promised": return "var(--amber)";
    case "pending": return "var(--accent)";
    case "disputed": return "var(--danger)";
    default: return "var(--text-dim)";
  }
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

  const cf = data?.cashflow;

  return (
    <>
      <Header />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px" }}>
        {/* Stripe Connection */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "16px 24px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
              {data?.connected ? "Stripe Connected" : "Stripe Not Connected"}
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {data?.connected
                ? `Account: ${data.stripeAccountId?.slice(0, 16)}...`
                : "Connect to sync invoices and receive payments"}
            </div>
          </div>
          {!data?.connected && (
            <a href="/connect-stripe" style={{
              background: "var(--accent)",
              color: "#fff",
              padding: "8px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}>
              Connect
            </a>
          )}
        </div>

        {/* Cashflow Board */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 32,
        }}>
          {[
            { label: "Expected This Week", value: cf ? formatCents(cf.expectedThisWeek) : "$0", color: "var(--accent)" },
            { label: "Overdue", value: cf ? formatCents(cf.overdue) : "$0", color: "var(--danger)" },
            { label: "Collected This Week", value: cf ? formatCents(cf.collectedThisWeek) : "$0", color: "var(--green)" },
            { label: "At Risk", value: cf ? formatCents(cf.atRisk) : "$0", color: "var(--amber)" },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "16px 20px",
            }}>
              <div style={{
                color: "var(--text-dim)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 6,
              }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Agent Actions */}
        {data && data.invoices && data.invoices.filter(i => i.status === "overdue" || i.status === "promised").length > 0 && (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 24px",
            marginBottom: 24,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              Agent Actions
            </h3>
            {data.invoices
              .filter(i => i.status === "overdue" || i.status === "promised")
              .map(inv => (
                <div key={inv.id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 13,
                }}>
                  <div>
                    <strong>{inv.customer.name}</strong>
                    {" — "}
                    {inv.invoiceNumber} ({formatCents(inv.amount)})
                    <span style={{ color: "var(--text-dim)", marginLeft: 8 }}>
                      {inv.status === "overdue"
                        ? `Overdue ${Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)} days`
                        : inv.promiseDate
                          ? `Promised ${formatDate(inv.promiseDate)}`
                          : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{
                      background: "var(--accent)",
                      color: "#fff",
                      padding: "4px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: "pointer",
                    }}>
                      Draft Follow-up
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Invoice List */}
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          Invoices
        </h2>

        {data?.invoices && data.invoices.length > 0 ? (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: "var(--text-dim)",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Invoice</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Customer</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Due</th>
                  <th style={{ textAlign: "right", padding: "10px 16px" }}>Amount</th>
                  <th style={{ textAlign: "center", padding: "10px 16px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id} style={{
                    borderBottom: "1px solid var(--border)",
                    fontSize: 13,
                  }}>
                    <td style={{ padding: "10px 16px", fontWeight: 600 }}>
                      {inv.invoiceNumber}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {inv.customer.name}
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--text-dim)" }}>
                      {formatDate(inv.dueDate)}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700 }}>
                      {formatCents(inv.amount)}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center" }}>
                      <span style={{
                        background: statusBadgeColor(inv.status) + "22",
                        color: statusBadgeColor(inv.status),
                        padding: "2px 10px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "capitalize",
                      }}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 40,
            textAlign: "center",
            color: "var(--text-dim)",
            fontSize: 14,
          }}>
            No invoices yet.
          </div>
        )}
      </main>
    </>
  );
}
