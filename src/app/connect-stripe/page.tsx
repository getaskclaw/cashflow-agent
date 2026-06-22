"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";

export default function ConnectStripePage() {
  const { data: session } = useSession();
  const [connectUrl, setConnectUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stripe/connect")
      .then((r) => r.json())
      .then((d) => setConnectUrl(d.url))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Header />
      <main
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "60px 24px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            marginBottom: 8,
          }}
        >
          Connect Stripe
        </h1>
        <p
          style={{
            color: "var(--text-dim)",
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 32,
          }}
        >
          We use Stripe Connect — the same secure OAuth flow used by thousands
          of apps. You retain full control of your Stripe account.
        </p>

        {loading ? (
          <p style={{ color: "var(--text-dim)" }}>
            Preparing connection...
          </p>
        ) : connectUrl ? (
          <a
            href={connectUrl}
            style={{
              display: "inline-block",
              background: "var(--accent)",
              color: "#fff",
              padding: "14px 32px",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Connect with Stripe
          </a>
        ) : (
          <p style={{ color: "var(--red)" }}>
            Failed to initialize connection.{" "}
            {!session
              ? "Please sign in first."
              : "Check that STRIPE_CLIENT_ID is set."}
          </p>
        )}

        <div
          style={{
            marginTop: 40,
            padding: 20,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            textAlign: "left",
            fontSize: 12,
            color: "var(--text-dim)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--text)" }}>What happens when you connect?</strong>
          <ol style={{ margin: "8px 0 0", paddingLeft: 16 }}>
            <li>You&apos;re redirected to Stripe to authorize access (read-only for transactions)</li>
            <li>We sync your recent charges so the agent can read each customer thread</li>
            <li>Data stays in your account — we never store raw Stripe credentials</li>
            <li>You can sync manually anytime or set up automatic sync</li>
          </ol>
        </div>
      </main>
    </>
  );
}
