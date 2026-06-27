"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function Header({ demo }: { demo?: boolean }) {
  const { data: session } = useSession();

  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <span style={{ fontWeight: 800, fontSize: 18 }}>
          <span style={{ color: "var(--accent)" }}>Cashflow</span> Agent
        </span>
        {demo && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--amber)",
              background: "var(--amber)" + "22",
              padding: "2px 10px",
              borderRadius: 12,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
            }}
          >
            Demo Mode
          </span>
        )}
        {session && (
          <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
            <a
              href="/dashboard"
              style={{ color: "var(--text-dim)", textDecoration: "none" }}
            >
              Dashboard
            </a>
            <a
              href="/reports"
              style={{ color: "var(--text-dim)", textDecoration: "none" }}
            >
              Reports
            </a>
            <a
              href="/billing"
              style={{ color: "var(--text-dim)", textDecoration: "none" }}
            >
              Billing
            </a>
            <a
              href="/settings"
              style={{ color: "var(--text-dim)", textDecoration: "none" }}
            >
              Settings
            </a>
          </nav>
        )}
      </div>
      <div>
        {session ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {session.user?.image && (
              <img
                src={session.user.image}
                alt=""
                width={28}
                height={28}
                style={{ borderRadius: "50%" }}
              />
            )}
            <span style={{ fontSize: 14, color: "var(--text-dim)" }}>
              {session.user?.email}
            </span>
            <button
              onClick={() => signOut()}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-dim)",
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn()}
            style={{
              background: "var(--accent)",
              border: "none",
              color: "#fff",
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
