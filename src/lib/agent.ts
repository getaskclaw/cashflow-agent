/**
 * Collections agent — TypeScript replacement for the Python scripts.
 *
 * 1. readCustomerThread()  — replaces read_customer_thread.py
 * 2. draftFollowup()       — replaces draft_followup.py
 * 3. parseReply()          — replaces parse_reply.py
 *
 * No subprocess, no Python, no hermes CLI.
 * All intelligence comes from direct LLM API calls via src/lib/llm.ts.
 */

import { prisma } from "@/lib/db";
import { callLLM, type LLMMessage } from "@/lib/llm";

// ─── Types ─────────────────────────────────────────────────────────────

export interface CustomerThread {
  invoice: {
    id: string;
    invoiceNumber: string;
    amountCents: number;
    amountDisplay: string;
    currency: string;
    description: string | null;
    dueDate: string | null;
    status: string;
    promiseDate: string | null;
    paymentLinkId: string | null;
    paidAt: string | null;
  };
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    notes: string | null;
  };
  communications: {
    id: string;
    direction: string;
    channel: string;
    content: string;
    sentAt: string | null;
    parsedStatus: string | null;
    parsedSummary: string | null;
    createdAt: string;
  }[];
  daysOverdue: number;
  priorFollowupCount: number;
  lastPromiseDate: string | null;
}

export interface DraftResult {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  suggestedTone: string;
  draft: string;
}

export interface ParsedReply {
  parsedStatus: string;
  parsedPromiseDate: string | null;
  parsedSummary: string;
  recommendedTone: string;
  nextAction: string;
}

// ─── 1. Read Customer Thread ───────────────────────────────────────────

export async function readCustomerThread(invoiceId: string): Promise<CustomerThread> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      amount: true,
      currency: true,
      description: true,
      dueDate: true,
      status: true,
      promiseDate: true,
      paymentLinkId: true,
      paidAt: true,
      customer: {
        select: { id: true, name: true, email: true, phone: true, notes: true },
      },
      communications: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          channel: true,
          content: true,
          sentAt: true,
          parsedStatus: true,
          parsedSummary: true,
          createdAt: true,
        },
      },
    },
  });

  if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);

  const now = new Date();
  const daysOverdue = invoice.dueDate
    ? Math.max(0, Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86_400_000))
    : 0;

  const priorFollowupCount = invoice.communications.filter(
    (c) => c.direction === "outbound"
  ).length;

  // Find the latest promise date across communications + invoice
  const commPromiseDates = invoice.communications
    .filter((c) => c.parsedStatus === "promised")
    .map((c) => c.sentAt || c.createdAt)
    .filter(Boolean) as Date[];

  const lastPromiseDate = [
    invoice.promiseDate,
    ...commPromiseDates,
  ]
    .filter(Boolean)
    .sort((a, b) => (b!.getTime() - a!.getTime()))[0];

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountCents: invoice.amount,
      amountDisplay: (invoice.amount / 100).toFixed(2),
      currency: invoice.currency || "usd",
      description: invoice.description,
      dueDate: invoice.dueDate?.toISOString().split("T")[0] ?? null,
      status: invoice.status,
      promiseDate: invoice.promiseDate?.toISOString().split("T")[0] ?? null,
      paymentLinkId: invoice.paymentLinkId,
      paidAt: invoice.paidAt?.toISOString().split("T")[0] ?? null,
    },
    customer: {
      id: invoice.customer.id,
      name: invoice.customer.name,
      email: invoice.customer.email,
      phone: invoice.customer.phone,
      notes: invoice.customer.notes,
    },
    communications: invoice.communications.map((c) => ({
      id: c.id,
      direction: c.direction,
      channel: c.channel,
      content: c.content,
      sentAt: c.sentAt?.toISOString() ?? null,
      parsedStatus: c.parsedStatus,
      parsedSummary: c.parsedSummary,
      createdAt: c.createdAt.toISOString(),
    })),
    daysOverdue,
    priorFollowupCount,
    lastPromiseDate: lastPromiseDate?.toISOString().split("T")[0] ?? null,
  };
}

// ─── 2. Draft Follow-up ────────────────────────────────────────────────

function pickTone(thread: CustomerThread, override?: string): string {
  if (override) return override;
  const { daysOverdue, priorFollowupCount, lastPromiseDate } = thread;
  if (priorFollowupCount <= 1 && daysOverdue <= 7 && !lastPromiseDate) return "friendly";
  if (daysOverdue <= 7) return "polite";
  if (daysOverdue <= 30) return "firm";
  return "final";
}

function buildDraftPrompt(thread: CustomerThread, tone: string): string {
  const { invoice, customer, communications, daysOverdue, priorFollowupCount, lastPromiseDate } = thread;

  const history = communications
    .map((c) => {
      const who = c.direction === "inbound" ? "Customer" : "Us";
      const date = (c.sentAt || c.createdAt).split("T")[0];
      return `[${date}] ${who}: ${c.content.trim()}`;
    })
    .join("\n") || "(no prior messages)";

  const promiseNote = lastPromiseDate
    ? `The customer previously promised to pay by ${lastPromiseDate} — that date has passed.`
    : "No prior promise on file.";

  return (
    `You are a collections agent for a small business. Draft a ${tone} follow-up ` +
    `email to a customer about an overdue invoice. Use plain text, no markdown. ` +
    `Keep it under 150 words. Always reference the invoice number and amount. ` +
    `Do not invent facts. Sign off as 'Alex, Roofing Pro'.\n\n` +
    `Customer: ${customer.name} <${customer.email}>\n` +
    `Customer notes: ${customer.notes || "(none)"}\n` +
    `Invoice: #${invoice.invoiceNumber} for $${invoice.amountDisplay} ${invoice.currency.toUpperCase()} ` +
    `(due ${invoice.dueDate}, ${daysOverdue} days overdue)\n` +
    `Description: ${invoice.description || "(none)"}\n` +
    `Prior follow-ups sent: ${priorFollowupCount}\n` +
    `${promiseNote}\n\n` +
    `Full message history (oldest first):\n${history}\n\n` +
    `Write only the email body. Start with "Hi ${customer.name.split(" ")[0]},".`
  );
}

export async function draftFollowup(
  invoiceId: string,
  toneOverride?: string
): Promise<DraftResult> {
  const thread = await readCustomerThread(invoiceId);
  const tone = pickTone(thread, toneOverride);
  const prompt = buildDraftPrompt(thread, tone);

  const response = await callLLM(
    [{ role: "user", content: prompt }],
    { maxTokens: 2000, temperature: 0.7 }
  );

  return {
    invoiceId,
    invoiceNumber: thread.invoice.invoiceNumber,
    customerName: thread.customer.name,
    customerEmail: thread.customer.email,
    suggestedTone: tone,
    draft: response.content.trim(),
  };
}

// ─── 3. Parse Reply ────────────────────────────────────────────────────

function buildParsePrompt(thread: CustomerThread, replyText: string): string {
  const { invoice, customer, communications, daysOverdue, priorFollowupCount, lastPromiseDate } = thread;
  const today = new Date().toISOString().split("T")[0];

  const history = communications
    .map((c) => {
      const who = c.direction === "inbound" ? "Customer" : "Us";
      return `${who}: ${c.content.trim()}`;
    })
    .join("\n") || "(none)";

  return (
    `You are a collections agent assistant. Classify the customer's reply ` +
    `and respond with ONLY a JSON object — no markdown, no prose.\n\n` +
    `Schema:\n` +
    `{\n` +
    `  "parsed_status": "promised" | "disputed" | "question" | "ignored",\n` +
    `  "parsed_promise_date": "YYYY-MM-DD" or null,\n` +
    `  "parsed_summary": "one-sentence summary",\n` +
    `  "recommended_tone": "polite" | "firm" | "final" | "friendly",\n` +
    `  "next_action": "check_payment" | "escalate" | "wait" | "human_needed"\n` +
    `}\n\n` +
    `Rules:\n` +
    `- parsed_status='promised' only if the customer commits to a specific date.\n` +
    `- parsed_promise_date must be a real date in YYYY-MM-DD, in the future relative to today.\n` +
    `  Resolve vague phrases ('next Friday', 'end of week') to an actual date.\n` +
    `- parsed_status='disputed' if the customer disputes the charge or quality of work.\n` +
    `- parsed_status='question' if the customer asks a question that needs a human answer.\n` +
    `- parsed_status='ignored' if the reply is non-responsive or no reply at all.\n` +
    `- Today is ${today}.\n\n` +
    `Customer: ${customer.name}\n` +
    `Invoice: #${invoice.invoiceNumber} for $${invoice.amountDisplay} ${invoice.currency.toUpperCase()} ` +
    `(due ${invoice.dueDate}, ${daysOverdue} days overdue)\n` +
    `Prior follow-ups: ${priorFollowupCount}\n` +
    `Last promise on file: ${lastPromiseDate || "none"}\n\n` +
    `Prior message history:\n${history}\n\n` +
    `Customer's new reply to classify:\n"""\n${replyText}\n"""\n\n` +
    `Return only the JSON object.`
  );
}

function extractJSON(text: string): Record<string, unknown> {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // Strip code fences
    const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (fenced) return JSON.parse(fenced[1]);
    // Find first {...} block
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not extract JSON from LLM output: ${text.slice(0, 200)}`);
  }
}

const VALID_STATUSES = new Set(["promised", "disputed", "question", "ignored"]);
const VALID_TONES = new Set(["polite", "firm", "final", "friendly"]);
const VALID_ACTIONS = new Set(["check_payment", "escalate", "wait", "human_needed"]);

function coerceParsed(parsed: Record<string, unknown>): ParsedReply {
  let status = (parsed.parsed_status as string) || "ignored";
  if (!VALID_STATUSES.has(status)) status = "ignored";

  let tone = (parsed.recommended_tone as string) || "polite";
  if (!VALID_TONES.has(tone)) tone = "polite";

  let action = (parsed.next_action as string) || "wait";
  if (!VALID_ACTIONS.has(action)) action = "wait";

  let promiseDate = (parsed.parsed_promise_date as string) || null;
  if (promiseDate) {
    const parsed_date = new Date(promiseDate);
    if (isNaN(parsed_date.getTime())) promiseDate = null;
  }

  return {
    parsedStatus: status,
    parsedPromiseDate: promiseDate,
    parsedSummary: String(parsed.parsed_summary || "").trim(),
    recommendedTone: tone,
    nextAction: action,
  };
}

export async function parseReply(
  invoiceId: string,
  replyText: string
): Promise<ParsedReply> {
  if (!replyText?.trim()) {
    const thread = await readCustomerThread(invoiceId);
    return {
      parsedStatus: "ignored",
      parsedPromiseDate: null,
      parsedSummary: "No reply received by the scheduled check.",
      recommendedTone: thread.daysOverdue <= 30 ? "firm" : "final",
      nextAction: "escalate",
    };
  }

  const thread = await readCustomerThread(invoiceId);
  const prompt = buildParsePrompt(thread, replyText);

  const response = await callLLM(
    [{ role: "user", content: prompt }],
    { maxTokens: 2000, temperature: 0.3 }
  );

  const parsed = extractJSON(response.content);
  return coerceParsed(parsed);
}
