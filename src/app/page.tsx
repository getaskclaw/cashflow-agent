"use client";

import { useSession, signIn } from "next-auth/react";
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
            <div style={{ display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
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
              <a
                href="/dashboard?demo=1"
                style={{
                  display: "inline-block",
                  background: "transparent",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  padding: "14px 32px",
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                View Live Demo →
              </a>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
              {/* Google sign-in */}
              <button
                onClick={() => signIn("google")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#fff",
                  color: "#1a1a1a",
                  border: "1px solid #e0e0e0",
                  padding: "14px 28px",
                  borderRadius: 12,
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>

              <a
                href="/dashboard?demo=1"
                style={{
                  display: "inline-block",
                  background: "transparent",
                  color: "var(--text-dim)",
                  border: "1px solid var(--border)",
                  padding: "12px 28px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                or try the live demo →
              </a>
            </div>
          )}
        </div>

        <p
          style={{
            color: "var(--text-dim)",
            fontSize: 12,
            marginTop: 24,
          }}
        >
          No credit card required. Your Stripe data never leaves your control.{" "}
          <a href="/pricing" style={{ color: "var(--accent)", textDecoration: "none" }}>
            See pricing →
          </a>
        </p>
      </main>
    </>
  );
}