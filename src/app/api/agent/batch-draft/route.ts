import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";
import { checkRateLimit, BATCH_RATE_LIMIT } from "@/lib/rate-limit";
import { draftFollowup } from "@/lib/agent";

interface BatchDraft {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  status: string;
  draft: string;
  suggestedTone: string;
  error?: string;
}

/**
 * Batch collections — drafts follow-ups for ALL overdue/promised invoices
 * in a single call. Returns an array of drafts for batch approval.
 *
 * Uses the TypeScript agent (direct LLM API call, no Python subprocess).
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

  // Rate limit batch LLM calls (stricter — N calls per request)
  const rl = checkRateLimit("batch:" + userId, BATCH_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in " + rl.retryAfter + "s." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  // Find all overdue + promised-expired invoices
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      OR: [
        { status: "overdue" },
        {
          status: "promised",
          promiseDate: { lt: now },
        },
      ],
    },
    include: {
      customer: { select: { name: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  if (invoices.length === 0) {
    return NextResponse.json({
      ok: true,
      drafts: [],
      total: 0,
      message: "No overdue invoices to process.",
    });
  }

  const drafts: BatchDraft[] = [];

  // Process each invoice sequentially (agent reads thread → drafts)
  for (const inv of invoices) {
    try {
      const result = await draftFollowup(inv.id);
      drafts.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer.name,
        amount: inv.amount,
        status: inv.status,
        draft: result.draft,
        suggestedTone: result.suggestedTone,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      drafts.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer.name,
        amount: inv.amount,
        status: inv.status,
        draft: "",
        suggestedTone: "polite",
        error: msg,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    drafts,
    total: drafts.length,
    errors: drafts.filter((d) => d.error).length,
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;
