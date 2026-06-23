import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";
import { checkRateLimit, LLM_RATE_LIMIT } from "@/lib/rate-limit";
import { parseReply } from "@/lib/agent";

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

  let body: { invoiceId?: string; replyText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { invoiceId, replyText } = body || {};

  if (!invoiceId || typeof invoiceId !== "string") {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }
  if (!replyText || typeof replyText !== "string" || !replyText.trim()) {
    return NextResponse.json({ error: "Missing replyText" }, { status: 400 });
  }

  // Verify ownership
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { userId: true, invoiceNumber: true },
  });
  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  try {
    const parsed = await parseReply(invoiceId, replyText);

    // Store the inbound communication + update invoice status atomically
    const updates: { status: string; promiseDate?: Date } | null =
      parsed.parsedStatus === "promised" && parsed.parsedPromiseDate
        ? { status: "promised", promiseDate: new Date(parsed.parsedPromiseDate) }
        : parsed.parsedStatus === "disputed"
          ? { status: "disputed" }
          : null;

    const [communication] = await prisma.$transaction([
      prisma.communication.create({
        data: {
          invoiceId,
          direction: "inbound",
          channel: "email",
          content: replyText.trim(),
          parsedStatus: parsed.parsedStatus,
          parsedPromiseDate: parsed.parsedPromiseDate
            ? new Date(parsed.parsedPromiseDate)
            : null,
          parsedSummary: parsed.parsedSummary,
        },
      }),
      ...(updates
        ? [prisma.invoice.update({ where: { id: invoiceId }, data: updates })]
        : []),
    ]);

    return NextResponse.json({
      ok: true,
      communicationId: communication.id,
      invoiceNumber: invoice.invoiceNumber,
      parsed: {
        status: parsed.parsedStatus,
        promiseDate: parsed.parsedPromiseDate,
        summary: parsed.parsedSummary,
        recommendedTone: parsed.recommendedTone,
        nextAction: parsed.nextAction,
      },
      invoiceUpdated: updates !== null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[reply] parseReply failed:", msg);
    return NextResponse.json(
      { error: "Reply parsing failed" },
      { status: 502 }
    );
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 180;
