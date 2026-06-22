"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/header";

// ─── Types ──────────────────────────────────────────────

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

interface DraftResult {
  invoice: {
    invoice_number: string;
    amount_display: string;
    currency: string;
    description: string | null;
    due_date: string | null;
    status: string;
  };
  customer: { name: string; email: string };
  daysOverdue: number;
  priorFollowupCount: number;
  lastPromiseDate: string | null;
  draft: string;
  suggestedTone: string;
}

interface PromiseItem {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  promiseDate: string;
  daysUntil: number;
  isBroken: boolean;
  urgency: "broken" | "critical" | "soon" | "ok";
  lastMessage: string | null;
}

interface ThreadMessage {
  id: string;
  direction: string;
  channel: string;
  content: string;
  agentDraft: boolean;
  approved: boolean;
  sentAt: string | null;
  createdAt: string;
  parsedStatus: string | null;
  parsedPromiseDate: string | null;
  parsedSummary: string | null;
}

interface ThreadData {
  invoice: {
    id: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    description: string | null;
    dueDate: string;
    status: string;
    promiseDate: string | null;
    paidAt: string | null;
    paymentLinkId: string | null;
  };
  customer: { name: string; email: string; phone: string | null; notes: string | null };
  communications: ThreadMessage[];
}

interface ReplyResult {
  ok: boolean;
  communicationId: string;
  invoiceNumber: string;
  parsed: {
    status: string;
    promiseDate: string | null;
    summary: string;
    recommendedTone: string;
    nextAction: string;
  };
  invoiceUpdated: boolean;
}

type ModalState =
  | { kind: "closed" }
  | { kind: "loading"; invoice: Invoice }
  | { kind: "error"; invoice: Invoice; message: string }
  | { kind: "ready"; invoice: Invoice; result: DraftResult; editing: boolean; draftText: string }
  | { kind: "approving"; invoice: Invoice; result: DraftResult; editing: boolean; draftText: string };

type ReplyModalState =
  | { kind: "closed" }
  | { kind: "input"; invoice: Invoice }
  | { kind: "parsing"; invoice: Invoice }
  | { kind: "result"; invoice: Invoice; result: ReplyResult }
  | { kind: "error"; invoice: Invoice; message: string };

// ─── Helpers ────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

function daysOverdue(dueDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000));
}

function toneColor(tone: string): string {
  switch (tone) {
    case "friendly": return "var(--green)";
    case "polite": return "var(--accent)";
    case "firm": return "var(--amber)";
    case "final": return "var(--danger)";
    default: return "var(--text-dim)";
  }
}

function urgencyColor(u: string): string {
  switch (u) {
    case "broken": return "var(--danger)";
    case "critical": return "var(--amber)";
    case "soon": return "var(--accent)";
    default: return "var(--text-dim)";
  }
}

function parsedStatusColor(s: string): string {
  switch (s) {
    case "promised": return "var(--amber)";
    case "disputed": return "var(--danger)";
    case "question": return "var(--accent)";
    case "ignored": return "var(--text-dim)";
    default: return "var(--text-dim)";
  }
}

function nextActionLabel(action: string): string {
  switch (action) {
    case "check_payment": return "Check payment";
    case "escalate": return "Escalate tone";
    case "wait": return "Wait for customer";
    case "human_needed": return "Needs human";
    default: return action;
  }
}

function defaultScheduleDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

// ─── Main Component ─────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [replyModal, setReplyModal] = useState<ReplyModalState>({ kind: "closed" });
  const [replyText, setReplyText] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Invoice | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>(defaultScheduleDate());
  const [scheduling, setScheduling] = useState(false);

  // Thread drawer
  const [threadFor, setThreadFor] = useState<Invoice | null>(null);
  const [threadData, setThreadData] = useState<ThreadData | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  // Promise tracker
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [promisesLoading, setPromisesLoading] = useState(false);

  const isDemo = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("demo") === "1";
  }, []);
  const demoQuery = isDemo ? "?demo=1" : "";

  const refresh = useCallback(() => {
    setLoading(true);
    return fetch(`/api/dashboard${demoQuery}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [demoQuery]);

  const refreshPromises = useCallback(() => {
    setPromisesLoading(true);
    return fetch(`/api/agent/promises${demoQuery}`)
      .then((r) => r.json())
      .then((d) => setPromises(d.promises || []))
      .catch(console.error)
      .finally(() => setPromisesLoading(false));
  }, [demoQuery]);

  useEffect(() => {
    refresh();
    refreshPromises();
  }, [refresh, refreshPromises]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const summary = useMemo(() => {
    const invs = data?.invoices || [];
    const overdue = invs.filter((i) => i.status === "overdue");
    const promisedExpired = invs.filter(
      (i) => i.status === "promised" && i.promiseDate && new Date(i.promiseDate) < new Date()
    );
    const newQuotes = invs.filter((i) => i.status === "pending");
    const disputed = invs.filter((i) => i.status === "disputed");
    const needsAttention = overdue.length + promisedExpired.length + newQuotes.length + disputed.length;
    return {
      total: needsAttention,
      overdue: overdue.length,
      promisedExpired: promisedExpired.length,
      newQuotes: newQuotes.length,
      disputed: disputed.length,
    };
  }, [data]);

  // ─── Draft Follow-up ──────────────────────────────────

  const openDraft = useCallback(async (invoice: Invoice) => {
    setModal({ kind: "loading", invoice });
    try {
      const res = await fetch(`/api/agent/draft${demoQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setModal({
        kind: "ready",
        invoice,
        result: json as DraftResult,
        editing: false,
        draftText: (json as DraftResult).draft,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setModal({ kind: "error", invoice, message: msg });
    }
  }, [demoQuery]);

  const approveDraft = useCallback(async () => {
    if (modal.kind !== "ready" && modal.kind !== "approving") return;
    if (modal.kind === "approving") return;
    const { invoice, result, draftText } = modal;
    setModal({ kind: "approving", invoice, result, editing: false, draftText });
    try {
      const res = await fetch(`/api/agent/approve${demoQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, draftText, tone: result.suggestedTone }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setModal({ kind: "closed" });
      setToast({ kind: "ok", message: `Approved follow-up for ${invoice.customer.name}` });
      await Promise.all([refresh(), refreshPromises()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setModal({ kind: "ready", invoice, result, editing: false, draftText });
      setToast({ kind: "error", message: `Approve failed: ${msg}` });
    }
  }, [modal, refresh, refreshPromises, demoQuery]);

  // ─── Record Reply ─────────────────────────────────────

  const submitReply = useCallback(async () => {
    if (replyModal.kind !== "input") return;
    const invoice = replyModal.invoice;
    if (!replyText.trim()) return;
    setReplyModal({ kind: "parsing", invoice });
    try {
      const res = await fetch(`/api/agent/reply${demoQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, replyText: replyText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setReplyModal({ kind: "result", invoice, result: json as ReplyResult });
      setReplyText("");
      await Promise.all([refresh(), refreshPromises()]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setReplyModal({ kind: "error", invoice, message: msg });
    }
  }, [replyModal, replyText, demoQuery, refresh, refreshPromises]);

  // ─── Schedule ─────────────────────────────────────────

  const runSchedule = useCallback(async () => {
    if (!scheduleFor) return;
    setScheduling(true);
    try {
      const res = await fetch(`/api/agent/schedule${demoQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: scheduleFor.id, date: scheduleDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setToast({ kind: "ok", message: `Scheduled re-check for ${scheduleFor.customer.name} on ${scheduleDate}` });
      setScheduleFor(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setToast({ kind: "error", message: `Schedule failed: ${msg}` });
    } finally {
      setScheduling(false);
    }
  }, [scheduleFor, scheduleDate, demoQuery]);

  // ─── Thread Drawer ────────────────────────────────────

  const openThread = useCallback(async (invoice: Invoice) => {
    setThreadFor(invoice);
    setThreadData(null);
    setThreadLoading(true);
    try {
      const res = await fetch(`/api/agent/thread${demoQuery}&invoiceId=${invoice.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setThreadData(json as ThreadData);
    } catch (e) {
      console.error("Thread load failed:", e);
    } finally {
      setThreadLoading(false);
    }
  }, [demoQuery]);

  // ─── Render ───────────────────────────────────────────

  if (loading) {
    return (
      <>
        <Header demo={isDemo} />
        <div style={{ textAlign: "center", padding: 80, color: "var(--text-dim)" }}>
          Loading...
        </div>
      </>
    );
  }

  const cf = data?.cashflow;
  const actionInvoices =
    data?.invoices?.filter(
      (i) => i.status === "overdue" || i.status === "promised" || i.status === "disputed"
    ) || [];

  return (
    <>
      <Header demo={isDemo} />
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

        {/* Promise Tracker */}
        {promises.length > 0 && (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 24px",
            marginBottom: 24,
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Promise Tracker
            </h3>
            {promises.map((p) => (
              <div key={p.invoiceId} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
                gap: 12,
                flexWrap: "wrap",
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{p.customerName}</strong>
                  {" — "}
                  {p.invoiceNumber} ({formatCents(p.amount)})
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <span style={{
                    background: urgencyColor(p.urgency) + "22",
                    color: urgencyColor(p.urgency),
                    padding: "2px 10px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    {p.isBroken
                      ? `${Math.abs(p.daysUntil)} days overdue`
                      : p.daysUntil === 0
                        ? "Due today"
                        : `${p.daysUntil} days left`}
                  </span>
                  <ActionButton
                    label="View Thread"
                    color="var(--text-dim)"
                    onClick={() => {
                      const inv = data?.invoices?.find((i) => i.id === p.invoiceId);
                      if (inv) openThread(inv);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Agent Actions */}
        {actionInvoices.length > 0 && (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "16px 24px",
            marginBottom: 24,
          }}>
            {/* Status summary banner */}
            <div style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 14,
              paddingBottom: 14,
              borderBottom: "1px solid var(--border)",
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                {summary.total} {summary.total === 1 ? "invoice needs" : "invoices need"} attention
              </h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12 }}>
                {summary.overdue > 0 && (
                  <SummaryChip color="var(--danger)" label={`${summary.overdue} overdue`} />
                )}
                {summary.promisedExpired > 0 && (
                  <SummaryChip color="var(--amber)" label={`${summary.promisedExpired} promised-expired`} />
                )}
                {summary.newQuotes > 0 && (
                  <SummaryChip color="var(--accent)" label={`${summary.newQuotes} new-quotes`} />
                )}
                {summary.disputed > 0 && (
                  <SummaryChip color="var(--danger)" label={`${summary.disputed} disputed`} />
                )}
              </div>
            </div>

            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Agent Actions
            </h3>
            {actionInvoices.map((inv) => (
              <div key={inv.id} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
                gap: 12,
                flexWrap: "wrap",
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong>{inv.customer.name}</strong>
                  {" — "}
                  {inv.invoiceNumber} ({formatCents(inv.amount)})
                  <span style={{ color: "var(--text-dim)", marginLeft: 8 }}>
                    {inv.status === "overdue"
                      ? `Overdue ${daysOverdue(inv.dueDate)} days`
                      : inv.status === "disputed"
                        ? "⚠ Disputed"
                        : inv.promiseDate
                          ? `Promised ${formatDate(inv.promiseDate)}`
                          : "Promised"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                  <ActionButton label="Thread" color="var(--text-dim)" onClick={() => openThread(inv)} />
                  <ActionButton label="Draft Follow-up" color="var(--accent)" onClick={() => openDraft(inv)} />
                  <ActionButton
                    label="Record Reply"
                    color="var(--green)"
                    onClick={() => { setReplyModal({ kind: "input", invoice: inv }); setReplyText(""); }}
                  />
                  {inv.status === "promised" && (
                    <ActionButton
                      label="Schedule Check"
                      color="var(--amber)"
                      onClick={() => { setScheduleFor(inv); setScheduleDate(defaultScheduleDate()); }}
                    />
                  )}
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
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
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
                    <tr
                      key={inv.id}
                      onClick={() => openThread(inv)}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
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
                        {inv.status === "paid" ? (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: "var(--green)" + "22",
                            color: "var(--green)",
                            padding: "2px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            <span aria-hidden>&#10003;</span> Paid
                          </span>
                        ) : (
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
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* ─── Draft Modal ─────────────────────────────── */}
      {modal.kind !== "closed" && (
        <ModalOverlay onClose={() => setModal({ kind: "closed" })}>
          {modal.kind === "loading" && (
            <ModalBody title={`Drafting follow-up — ${modal.invoice.customer.name}`}>
              <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-dim)" }}>
                <Spinner />
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  Agent is reading the thread and drafting an email...
                </div>
              </div>
            </ModalBody>
          )}

          {modal.kind === "error" && (
            <ModalBody
              title={`Draft failed — ${modal.invoice.customer.name}`}
              onClose={() => setModal({ kind: "closed" })}
            >
              <div style={{
                background: "var(--danger)" + "18",
                border: `1px solid var(--danger)`,
                borderRadius: 8,
                padding: "12px 14px",
                fontSize: 13,
                color: "var(--danger)",
                whiteSpace: "pre-wrap",
                marginBottom: 16,
              }}>
                {modal.message}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <SecondaryButton label="Close" onClick={() => setModal({ kind: "closed" })} />
              </div>
            </ModalBody>
          )}

          {(modal.kind === "ready" || modal.kind === "approving") && (
            <ModalBody
              title={`Follow-up draft — ${modal.invoice.customer.name}`}
              onClose={() => setModal({ kind: "closed" })}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10,
                  fontSize: 12,
                }}>
                  <Detail label="Invoice" value={modal.result.invoice.invoice_number} />
                  <Detail label="Amount" value={`${modal.result.invoice.amount_display} ${modal.result.invoice.currency.toUpperCase()}`} />
                  <Detail label="Due" value={modal.result.invoice.due_date ? formatDate(modal.result.invoice.due_date) : "—"} />
                  <Detail label="Days overdue" value={String(modal.result.daysOverdue)} />
                  <Detail label="Prior follow-ups" value={String(modal.result.priorFollowupCount)} />
                  <Detail label="Customer" value={modal.result.customer.email} />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ color: "var(--text-dim)" }}>Suggested tone:</span>
                  <span style={{
                    background: toneColor(modal.result.suggestedTone) + "22",
                    color: toneColor(modal.result.suggestedTone),
                    padding: "2px 10px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "capitalize",
                  }}>
                    {modal.result.suggestedTone}
                  </span>
                  {modal.editing && (
                    <span style={{ color: "var(--text-dim)", marginLeft: "auto" }}>Editing</span>
                  )}
                </div>

                {modal.editing ? (
                  <textarea
                    value={modal.draftText}
                    onChange={(e) => setModal({ ...modal, draftText: e.target.value })}
                    style={{
                      width: "100%",
                      minHeight: 220,
                      background: "var(--bg)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "inherit",
                      lineHeight: 1.5,
                      resize: "vertical",
                    }}
                  />
                ) : (
                  <pre style={{
                    margin: 0,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 320,
                    overflow: "auto",
                  }}>
{modal.draftText}
                  </pre>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                  <SecondaryButton label="Cancel" onClick={() => setModal({ kind: "closed" })} />
                  {modal.editing ? (
                    <SecondaryButton label="Preview" onClick={() => setModal({ ...modal, editing: false })} />
                  ) : (
                    <SecondaryButton label="Edit" onClick={() => setModal({ ...modal, editing: true })} />
                  )}
                  <PrimaryButton
                    label={modal.kind === "approving" ? "Approving..." : "Approve"}
                    disabled={modal.kind === "approving" || !modal.draftText.trim()}
                    onClick={approveDraft}
                  />
                </div>
              </div>
            </ModalBody>
          )}
        </ModalOverlay>
      )}

      {/* ─── Reply Modal ─────────────────────────────── */}
      {replyModal.kind !== "closed" && (
        <ModalOverlay onClose={() => { setReplyModal({ kind: "closed" }); setReplyText(""); }}>
          {replyModal.kind === "input" && (
            <ModalBody
              title={`Record customer reply — ${replyModal.invoice.customer.name}`}
              onClose={() => { setReplyModal({ kind: "closed" }); setReplyText(""); }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  Paste the customer's reply email below. The agent will read it, classify the intent
                  (promise / dispute / question / ignored), extract any promise date, and update the invoice status.
                </div>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="e.g. Hey Alex, sorry for the delay. I'll send payment by Friday for sure."
                  style={{
                    width: "100%",
                    minHeight: 140,
                    background: "var(--bg)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                    resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <SecondaryButton label="Cancel" onClick={() => { setReplyModal({ kind: "closed" }); setReplyText(""); }} />
                  <PrimaryButton label="Parse Reply" disabled={!replyText.trim()} onClick={submitReply} />
                </div>
              </div>
            </ModalBody>
          )}

          {replyModal.kind === "parsing" && (
            <ModalBody title={`Parsing reply — ${replyModal.invoice.customer.name}`}>
              <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-dim)" }}>
                <Spinner />
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  Agent is reading the reply and classifying intent...
                </div>
              </div>
            </ModalBody>
          )}

          {replyModal.kind === "result" && replyModal.result && (
            <ModalBody
              title={`Reply parsed — ${replyModal.invoice.customer.name}`}
              onClose={() => { setReplyModal({ kind: "closed" }); setReplyText(""); }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Parsed classification */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  gap: 10,
                  fontSize: 12,
                }}>
                  <Detail label="Classification" value={replyModal.result.parsed.status} />
                  <Detail label="Promise date" value={replyModal.result.parsed.promiseDate ? formatDate(replyModal.result.parsed.promiseDate) : "—"} />
                  <Detail label="Next action" value={nextActionLabel(replyModal.result.parsed.nextAction)} />
                  <Detail label="Suggested tone" value={replyModal.result.parsed.recommendedTone} />
                </div>

                {/* Summary */}
                <div style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}>
                  <div style={{ color: "var(--text-dim)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                    Agent Summary
                  </div>
                  {replyModal.result.parsed.summary}
                </div>

                {/* Status badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ color: "var(--text-dim)" }}>Invoice updated:</span>
                  <span style={{
                    background: replyModal.result.invoiceUpdated ? "var(--green)" + "22" : "var(--text-dim)" + "22",
                    color: replyModal.result.invoiceUpdated ? "var(--green)" : "var(--text-dim)",
                    padding: "2px 10px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    {replyModal.result.invoiceUpdated ? "Yes — status changed" : "No status change"}
                  </span>
                </div>

                {/* Action buttons */}
                {(replyModal.result.parsed.status === "disputed" || replyModal.result.parsed.status === "question") && (
                  <div style={{
                    background: "var(--danger)" + "18",
                    border: `1px solid var(--danger)`,
                    borderRadius: 8,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "var(--danger)",
                  }}>
                    ⚠ This needs human attention. The agent will not auto-draft a reply for {replyModal.result.parsed.status} messages.
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  {replyModal.result.parsed.status === "promised" && (
                    <SecondaryButton
                      label="Schedule Check"
                      onClick={() => {
                        const inv = replyModal.invoice;
                        setReplyModal({ kind: "closed" });
                        setReplyText("");
                        setScheduleFor(inv);
                        if (replyModal.result.parsed.promiseDate) {
                          const d = new Date(replyModal.result.parsed.promiseDate);
                          d.setDate(d.getDate() + 1);
                          setScheduleDate(d.toISOString().slice(0, 10));
                        }
                      }}
                    />
                  )}
                  <PrimaryButton label="Done" onClick={() => { setReplyModal({ kind: "closed" }); setReplyText(""); }} />
                </div>
              </div>
            </ModalBody>
          )}

          {replyModal.kind === "error" && (
            <ModalBody
              title={`Parse failed — ${replyModal.invoice.customer.name}`}
              onClose={() => { setReplyModal({ kind: "closed" }); setReplyText(""); }}
            >
              <div style={{
                background: "var(--danger)" + "18",
                border: `1px solid var(--danger)`,
                borderRadius: 8,
                padding: "12px 14px",
                fontSize: 13,
                color: "var(--danger)",
                whiteSpace: "pre-wrap",
                marginBottom: 16,
              }}>
                {replyModal.message}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <SecondaryButton label="Close" onClick={() => { setReplyModal({ kind: "closed" }); setReplyText(""); }} />
              </div>
            </ModalBody>
          )}
        </ModalOverlay>
      )}

      {/* ─── Schedule Check Modal ──────────────────────── */}
      {scheduleFor && (
        <ModalOverlay onClose={() => !scheduling && setScheduleFor(null)}>
          <ModalBody
            title={`Schedule re-check — ${scheduleFor.customer.name}`}
            onClose={() => !scheduling && setScheduleFor(null)}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
              <div style={{ color: "var(--text-dim)" }}>
                Pick the date the agent should re-check{" "}
                <strong style={{ color: "var(--text)" }}>{scheduleFor.invoiceNumber}</strong>{" "}
                and escalate if still unpaid.
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Re-check date</span>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  style={{
                    background: "var(--bg)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                  }}
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <SecondaryButton label="Cancel" disabled={scheduling} onClick={() => setScheduleFor(null)} />
                <PrimaryButton label={scheduling ? "Scheduling..." : "Schedule"} disabled={scheduling || !scheduleDate} onClick={runSchedule} />
              </div>
            </div>
          </ModalBody>
        </ModalOverlay>
      )}

      {/* ─── Thread Drawer ─────────────────────────────── */}
      {threadFor && (
        <div
          onClick={() => !threadLoading && setThreadFor(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 998,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              borderLeft: "1px solid var(--border)",
              width: "100%",
              maxWidth: 520,
              height: "100%",
              overflow: "auto",
              padding: 24,
            }}
          >
            {/* Drawer header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                  {threadFor.invoiceNumber}
                </h3>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                  {threadFor.customer.name} · {formatCents(threadFor.amount)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setThreadFor(null)}
                aria-label="Close"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-dim)",
                  fontSize: 20,
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 0,
                  fontFamily: "inherit",
                }}
              >
                &times;
              </button>
            </div>

            {threadLoading && (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>
                <Spinner />
                <div style={{ marginTop: 12, fontSize: 13 }}>Loading thread...</div>
              </div>
            )}

            {threadData && !threadLoading && (
              <>
                {/* Invoice details */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
                  gap: 8,
                  fontSize: 12,
                  marginBottom: 20,
                  paddingBottom: 20,
                  borderBottom: "1px solid var(--border)",
                }}>
                  <Detail label="Status" value={threadData.invoice.status} />
                  <Detail label="Due" value={formatDate(threadData.invoice.dueDate)} />
                  <Detail label="Promise" value={threadData.invoice.promiseDate ? formatDate(threadData.invoice.promiseDate) : "—"} />
                  <Detail label="Paid" value={threadData.invoice.paidAt ? formatDate(threadData.invoice.paidAt) : "—"} />
                </div>

                {/* Customer notes */}
                {threadData.customer.notes && (
                  <div style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 12,
                    marginBottom: 20,
                    lineHeight: 1.5,
                  }}>
                    <div style={{ color: "var(--text-dim)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                      Customer Notes
                    </div>
                    {threadData.customer.notes}
                  </div>
                )}

                {/* Conversation thread */}
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Conversation ({threadData.communications.length})
                </h4>

                {threadData.communications.length === 0 ? (
                  <div style={{ color: "var(--text-dim)", fontSize: 13, textAlign: "center", padding: 20 }}>
                    No messages yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {threadData.communications.map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: msg.direction === "inbound" ? "flex-start" : "flex-end",
                        }}
                      >
                        <div style={{
                          maxWidth: "85%",
                          background: msg.direction === "inbound" ? "var(--bg)" : "var(--accent)" + "15",
                          border: `1px solid ${msg.direction === "inbound" ? "var(--border)" : "var(--accent)" + "33"}`,
                          borderRadius: 12,
                          padding: "10px 14px",
                          fontSize: 13,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}>
                          {/* Meta row */}
                          <div style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                            marginBottom: 6,
                            fontSize: 11,
                            color: "var(--text-dim)",
                          }}>
                            <span style={{ fontWeight: 700 }}>
                              {msg.direction === "inbound" ? "Customer" : msg.agentDraft ? "Agent draft" : "Sent"}
                            </span>
                            <span>· {formatDateTime(msg.sentAt || msg.createdAt)}</span>
                            {msg.agentDraft && msg.approved && (
                              <span style={{ color: "var(--green)" }}>✓ approved</span>
                            )}
                          </div>

                          {msg.content}

                          {/* Parsed badges for inbound */}
                          {msg.direction === "inbound" && msg.parsedStatus && (
                            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <span style={{
                                background: parsedStatusColor(msg.parsedStatus) + "22",
                                color: parsedStatusColor(msg.parsedStatus),
                                padding: "1px 8px",
                                borderRadius: 10,
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "capitalize",
                              }}>
                                {msg.parsedStatus}
                              </span>
                              {msg.parsedPromiseDate && (
                                <span style={{
                                  background: "var(--amber)" + "22",
                                  color: "var(--amber)",
                                  padding: "1px 8px",
                                  borderRadius: 10,
                                  fontSize: 10,
                                  fontWeight: 700,
                                }}>
                                  Promise: {formatDate(msg.parsedPromiseDate)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Summary below inbound */}
                        {msg.direction === "inbound" && msg.parsedSummary && (
                          <div style={{
                            fontSize: 11,
                            color: "var(--text-dim)",
                            marginTop: 4,
                            maxWidth: "85%",
                            fontStyle: "italic",
                          }}>
                            {msg.parsedSummary}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick actions */}
                <div style={{
                  marginTop: 24,
                  paddingTop: 20,
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}>
                  <ActionButton label="Draft Follow-up" color="var(--accent)" onClick={() => { openDraft(threadFor); setThreadFor(null); }} />
                  <ActionButton
                    label="Record Reply"
                    color="var(--green)"
                    onClick={() => { setReplyModal({ kind: "input", invoice: threadFor }); setReplyText(""); setThreadFor(null); }}
                  />
                  {threadFor.status === "promised" && (
                    <ActionButton
                      label="Schedule Check"
                      color="var(--amber)"
                      onClick={() => { setScheduleFor(threadFor); setScheduleDate(defaultScheduleDate()); setThreadFor(null); }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Toast ──────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--surface)",
          border: `1px solid ${toast.kind === "ok" ? "var(--green)" : "var(--danger)"}`,
          color: toast.kind === "ok" ? "var(--green)" : "var(--danger)",
          padding: "10px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          zIndex: 1000,
          maxWidth: "90vw",
        }}>
          {toast.message}
        </div>
      )}
    </>
  );
}

// ─── UI Components ──────────────────────────────────────

function SummaryChip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      background: color + "22",
      color,
      padding: "2px 10px",
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

function ActionButton({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: color,
        color: "#fff",
        border: "none",
        padding: "5px 12px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalBody({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div style={{ padding: 20 }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-dim)",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              padding: 0,
              fontFamily: "inherit",
            }}
          >
            &times;
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: "var(--text-dim)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
    </div>
  );
}

function PrimaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--accent)",
        color: "#fff",
        border: "none",
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function SecondaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        color: "var(--text)",
        border: "1px solid var(--border)",
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-label="loading"
      style={{
        display: "inline-block",
        width: 24,
        height: 24,
        border: "3px solid var(--border)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "cfspin 0.8s linear infinite",
      }}
    />
  );
}