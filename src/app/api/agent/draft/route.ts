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

export async function POST(req: Request) {
  let userId: string;

  if (isDemoRequest(req)) {
    const demoId = await getDemoUserId();
    if (!demoId) {
      return NextResponse.json(
        { error: "Demo user not seeded. Run `npx prisma db seed`." },
        { status: 404 }
      );
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

  let invoiceId: string;
  try {
    const body = await req.json();
    invoiceId = body?.invoiceId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!invoiceId || typeof invoiceId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid invoiceId" },
      { status: 400 }
    );
  }

  // Verify the invoice belongs to the acting user before letting the
  // agent scripts touch it.
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { userId: true },
  });
  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const env = {
    ...process.env,
    CASHFLOW_DB: process.env.CASHFLOW_DB || undefined,
  };

  try {
    // 1. Read the full customer thread (invoice + customer + comms).
    const threadProc = await execFileAsync(
      PYTHON,
      [`${SCRIPTS_DIR}/read_customer_thread.py`, invoiceId],
      { env, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }
    );
    const thread = JSON.parse(threadProc.stdout);

    if (thread?.error) {
      return NextResponse.json(
        { error: `read_customer_thread: ${thread.error}` },
        { status: 500 }
      );
    }

    // 2. Draft the follow-up email via the agent.
    let draft: { draft?: string; suggested_tone?: string; error?: string };
    try {
      const draftProc = await execFileAsync(
        PYTHON,
        [`${SCRIPTS_DIR}/draft_followup.py`, invoiceId],
        { env, timeout: 150_000, maxBuffer: 4 * 1024 * 1024 }
      );
      draft = JSON.parse(draftProc.stdout);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[draft] draft_followup failed:", msg);
      return NextResponse.json(
        { error: "Draft generation failed" },
        { status: 502 }
      );
    }

    if (draft?.error) {
      return NextResponse.json(
        { error: `draft_followup: ${draft.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      invoice: thread.invoice,
      customer: thread.customer,
      communications: thread.communications,
      daysOverdue: thread.days_overdue,
      priorFollowupCount: thread.prior_followup_count,
      lastPromiseDate: thread.last_promise_date,
      draft: draft.draft || "",
      suggestedTone: draft.suggested_tone || "polite",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Agent error:" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 180;
