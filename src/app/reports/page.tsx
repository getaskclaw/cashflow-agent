"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/header";

export default function ReportsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const formatCents = (c: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(c / 100);

  // Group transactions by jurisdiction
  const byJurisdiction: Record<
    string,
    { count: number; revenue: number; tax: number }
  > = {};
  if (data?.transactions) {
    for (const tx of data.transactions) {
      const j = tx.taxCalculation?.jurisdictionName || "Uncategorized";
      if (!byJurisdiction[j]) byJurisdiction[j] = { count: 0, revenue: 0, tax: 0 };
      byJurisdiction[j].count++;
      byJurisdiction[j].revenue += tx.amount;
      if (tx.taxCalculation) byJurisdiction[j].tax += tx.taxCalculation.taxAmount;
    }
  }

  return (
    <>
      <Header />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>
          Tax Reports
        </h1>

        {loading ? (
          <p style={{ color: "var(--text-dim)" }}>Loading...</p>
        ) : !data?.connected ? (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 40,
              textAlign: "center",
              color: "var(--text-dim)",
            }}
          >
            Connect your Stripe account to see tax reports.
          </div>
        ) : (
          <>
            {/* Summary by Jurisdiction */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
                marginBottom: 24,
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
                      Jurisdiction
                    </th>
                    <th style={{ textAlign: "right", padding: "10px 16px" }}>
                      Transactions
                    </th>
                    <th style={{ textAlign: "right", padding: "10px 16px" }}>
                      Revenue
                    </th>
                    <th style={{ textAlign: "right", padding: "10px 16px" }}>
                      Tax Due
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byJurisdiction)
                    .sort(([, a], [, b]) => b.tax - a.tax)
                    .map(([jurisdiction, stats]) => (
                      <tr
                        key={jurisdiction}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          fontSize: 13,
                        }}
                      >
                        <td style={{ padding: "10px 16px", fontWeight: 600 }}>
                          {jurisdiction}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          {stats.count}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right" }}>
                          {formatCents(stats.revenue)}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            textAlign: "right",
                            color: "var(--amber)",
                            fontWeight: 700,
                          }}
                        >
                          {stats.tax > 0
                            ? formatCents(stats.tax)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Export */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 20,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Export
              </h3>
              <p
                style={{
                  color: "var(--text-dim)",
                  fontSize: 13,
                  marginBottom: 16,
                }}
              >
                Download a CSV of all transactions with tax calculations for
                your accounting records.
              </p>
              <button
                onClick={() => {
                  const rows = [["Date","Customer","Country","Amount","Tax Rate","Tax Amount","Jurisdiction"]];
                  for (const tx of data.transactions) {
                    rows.push([
                      new Date(tx.createdAt).toISOString().split("T")[0],
                      tx.customerName || "",
                      tx.customerCountry || "",
                      formatCents(tx.amount),
                      tx.taxCalculation ? `${(tx.taxCalculation.taxRate * 100).toFixed(2)}%` : "",
                      tx.taxCalculation ? formatCents(tx.taxCalculation.taxAmount) : "",
                      tx.taxCalculation?.jurisdictionName || "",
                    ]);
                  }
                  const csv = rows.map((r) => r.join(",")).join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "taxassist-report.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                style={{
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  padding: "10px 20px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Download CSV
              </button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
