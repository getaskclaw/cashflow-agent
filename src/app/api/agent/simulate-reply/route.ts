import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";
import { checkRateLimit, LLM_RATE_LIMIT } from "@/lib/rate-limit";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const SCRIPTS_DIR =
  process.env.CASHFLOW_SCRIPTS_DIR ||
  `${process.cwd()}/hermes-skill/scripts`;

const PYTHON = process.env.CASHFLOW_PYTHON || "python3";

/**
 * Simulation mode — generates a realistic customer reply using the LLM.
 *
 * The agent roleplays as the customer based on:
 * - Customer personality (notes field)
 * - Invoice details (amount, days overdue, description)
 * - Full conversation history
 * - The tone of the last follow-up we sent
 *
 * Returns the generated reply text. The frontend then auto-submits
 * it through /api/agent/reply to close the loop.
 */
export async function POST(req: Request) {
  let userId: string;

  if (isDemoRequest(req)) {
    const demoId = await getDemoUserId();
    if (!demoId) {
      return NextResponse.json({ error: "Demo user not seeded." }, { status: 404 });
    }
    userId = demoId;
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = session.user.id;
  }

  // Rate limit LLM calls
  const rl = checkRateLimit(`llm:${userId}`, LLM_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: { invoiceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { invoiceId } = body || {};
  if (!invoiceId || typeof invoiceId !== "string") {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }

  // Verify ownership and get full context
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      userId: true,
      invoiceNumber: true,
      amount: true,
      currency: true,
      description: true,
      dueDate: true,
      status: true,
      customer: { select: { name: true, email: true, notes: true } },
      communications: {
        orderBy: { createdAt: "asc" },
        select: {
          direction: true,
          content: true,
          agentDraft: true,
          approved: true,
          createdAt: true,
        },
      },
    },
  });

  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Build the simulation prompt
  const history = invoice.communications
    .map((c) => {
      const who = c.direction === "inbound" ? "Customer" : "Agent";
      return `${who}: ${c.content.trim()}`;
    })
    .join("\n\n") || "(no prior messages)";

  const daysOverdue = Math.max(
    0,
    Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86400000)
  );

  const amountDisplay = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: invoice.currency.toUpperCase(),
  }).format(invoice.amount / 100);

  const personality = invoice.customer.notes || "No personality notes available.";

  const prompt = `You are roleplaying as a small business customer who just received a follow-up email about an overdue invoice. Write a realistic reply email.

Customer profile:
- Name: ${invoice.customer.name}
- Personality notes: ${personality}
- Invoice: #${invoice.invoiceNumber} for ${amountDisplay} (${daysOverdue} days overdue)
- Work done: ${invoice.description || "Not specified"}

Conversation so far (oldest first):
${history}

Rules:
- Write ONLY the email body (no subject line).
- Start with "Hi Alex," or similar.
- Be realistic and consistent with the customer's personality.
- If the personality notes say "pays slow but always comes through," lean toward making a promise.
- If the tone of the last agent email was "final" or very firm, the customer might push back, ask for more time, or dispute.
- If the tone was "polite" or "friendly," the customer is more likely to be apologetic and promise to pay.
- Keep it under 100 words. Natural, casual tone. No corporate speak.
- Do NOT include any meta-commentary or explanations. Just write the email.`;

  // Call Hermes CLI to generate the reply
  try {
    const proc = await execFileAsync(
      "hermes",
      ["chat", "-q", prompt, "-Q"],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }
    );

    const replyText = proc.stdout.trim();

    if (!replyText || replyText.length < 10) {
      return NextResponse.json({ error: "Generated reply was too short" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      replyText,
      customerName: invoice.customer.name,
      invoiceNumber: invoice.invoiceNumber,
    });
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[simulate] simulation failed:", msg);
    return NextResponse.json(
      { error: "Simulation failed" },
      { status: 502 }
    );
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 180;