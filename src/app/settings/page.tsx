"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";

interface ProfileData {
  companyName: string;
  senderName: string;
  senderEmail: string | null;
  locale: string;
  baseCurrency: string;
  vatNumber: string | null;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/settings/business-profile")
        .then((r) => r.json())
        .then(setProfile)
        .catch(() => setError("Failed to load profile"))
        .finally(() => setLoading(false));
    } else if (status === "unauthenticated") {
      setLoading(false);
    }
  }, [status]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    formData.forEach((value, key) => {
      data[key] = value as string;
    });

    try {
      const res = await fetch("/api/settings/business-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setProfile(result);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
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
          <p style={{ color: "var(--text-dim)" }}>Please sign in to view settings.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 32 }}>Business Settings</h1>

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

        {success && (
          <div
            style={{
              background: "var(--green)15",
              border: "1px solid var(--green)40",
              borderRadius: 10,
              padding: "12px 16px",
              color: "var(--green)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            Settings saved.
          </div>
        )}

        {profile && (
          <form onSubmit={handleSave}>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 28,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div>
                <label
                  htmlFor="companyName"
                  style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-dim)" }}
                >
                  Company name
                </label>
                <input
                  id="companyName"
                  name="companyName"
                  type="text"
                  defaultValue={profile.companyName}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="senderName"
                  style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-dim)" }}
                >
                  Sender name (used in follow-up emails)
                </label>
                <input
                  id="senderName"
                  name="senderName"
                  type="text"
                  defaultValue={profile.senderName}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="senderEmail"
                  style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-dim)" }}
                >
                  Sender email (optional — defaults to system address)
                </label>
                <input
                  id="senderEmail"
                  name="senderEmail"
                  type="email"
                  defaultValue={profile.senderEmail || ""}
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="locale"
                    style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-dim)" }}
                  >
                    Locale
                  </label>
                  <select
                    id="locale"
                    name="locale"
                    defaultValue={profile.locale}
                    style={{
                      width: "100%",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      color: "var(--text)",
                      fontSize: 14,
                    }}
                  >
                    <option value="en-GB">English (UK)</option>
                    <option value="en-US">English (US)</option>
                    <option value="en-IE">English (Ireland)</option>
                    <option value="de-DE">German</option>
                    <option value="fr-FR">French</option>
                    <option value="es-ES">Spanish</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="baseCurrency"
                    style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-dim)" }}
                  >
                    Base currency
                  </label>
                  <select
                    id="baseCurrency"
                    name="baseCurrency"
                    defaultValue={profile.baseCurrency}
                    style={{
                      width: "100%",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      color: "var(--text)",
                      fontSize: 14,
                    }}
                  >
                    <option value="GBP">GBP (£)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="vatNumber"
                  style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--text-dim)" }}
                >
                  VAT number (optional — included on invoices)
                </label>
                <input
                  id="vatNumber"
                  name="vatNumber"
                  type="text"
                  defaultValue={profile.vatNumber || ""}
                  placeholder="GB123456789"
                  style={{
                    width: "100%",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  background: "var(--gradient-accent)",
                  border: "none",
                  color: "#fff",
                  padding: "12px 28px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                  marginTop: 8,
                }}
              >
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
