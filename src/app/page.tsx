"use client";

import { useSession } from "next-auth/react";
import { Header } from "@/components/header";

export default function HomePage() {
  const { data: session } = useSession();

  return (
    <>
      <Header />
      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "60px 24px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 40,
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: 16,
            letterSpacing: "-0.5px",
          }}
        >
          The follow-up that{" "}
          <span style={{ color: "var(--accent)" }}>gets you paid</span>
          <br />
          written for you
        </h1>
        <p
          style={{
            color: "var(--text-dim)",
            fontSize: 16,
            lineHeight: 1.7,
            marginBottom: 40,
            maxWidth: 480,
            margin: "0 auto 40px",
          }}
        >
          Connect your Stripe account and let an AI agent read your customer
          threads, draft a personal follow-up for every overdue invoice, and
          track each promise. No spreadsheets. No generic reminders. No chasing
          payments by hand.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 400,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "20px 24px",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              One-click Stripe sync
            </h3>
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>
              Connect your Stripe account. We pull your invoices and the agent
              reads each customer thread automatically.
            </p>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "20px 24px",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>🌍</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              Reply-aware follow-ups
            </h3>
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>
              The agent reads what was promised, picks the right tone, and
              drafts a follow-up that actually gets a response — then parses the
              reply and schedules the next check.
            </p>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "20px 24px",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              Cashflow board
            </h3>
            <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>
              See expected, overdue, collected, and at-risk money at a glance.
              Know exactly which invoices need a nudge — no surprises.
            </p>
          </div>
        </div>

        <div style={{ marginTop: 48 }}>
          {session ? (
            <a
              href="/dashboard"
              style={{
                display: "inline-block",
                background: "var(--accent)",
                color: "#fff",
                padding: "14px 32px",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Go to Dashboard →
            </a>
          ) : (
            <button
              onClick={() => {
                const email = prompt("Enter your email to sign in:");
                if (email) {
                  fetch("/api/auth/signin/email", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, csrfToken: "" }),
                  });
                  alert(
                    "Check your email for a magic link! (If email isn't configured, use the demo mode.)"
                  );
                }
              }}
              style={{
                display: "inline-block",
                background: "var(--accent)",
                color: "#fff",
                padding: "14px 32px",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
              }}
            >
              Get Started Free
            </button>
          )}
        </div>

        <p
          style={{
            color: "var(--text-dim)",
            fontSize: 12,
            marginTop: 24,
          }}
        >
          No credit card required. Your Stripe data never leaves your control.
        </p>
      </main>
    </>
  );
}
