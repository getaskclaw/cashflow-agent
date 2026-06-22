import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const SCRIPTS_DIR =
  process.env.CASHFLOW_SCRIPTS_DIR ||
  `${process.env.HOME}/.hermes/skills/business/cashflow-agent/scripts`;

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
    select: { userId: true, invoiceNumber: true, status: true, promiseDate: true },
  });
  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const env = { ...process.env, CASHFLOW_DB: process.env.CASHFLOW_DB || undefined };

  let parsed: {
    parsed_status: string;
    parsed_promise_date: string | null;
    parsed_summary: string;
    recommended_tone: string;
    next_action: string;
    invoice_id?: string;
    invoice_number?: string;
    error?: string;
  };

  try {
    const proc = await execFileAsync(
      PYTHON,
      [`${SCRIPTS_DIR}/parse_reply.py`, invoiceId, replyText],
      { env, timeout: 150_000, maxBuffer: 4 * 1024 * 1024 }
    );
    parsed = JSON.parse(proc.stdout);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Reply parsing failed: ${msg}` },
      { status: 502 }
    );
  }

  if (parsed.error) {
    return NextResponse.json(
      { error: `parse_reply: ${parsed.error}` },
      { status: 500 }
    );
  }

  // Store the inbound communication with parsed metadata
  const communication = await prisma.communication.create({
    data: {
      invoiceId,
      direction: "inbound",
      channel: "email",
      content: replyText.trim(),
      parsedStatus: parsed.parsed_status,
      parsedPromiseDate: parsed.parsed_promise_date
        ? new Date(parsed.parsed_promise_date)
        : null,
      parsedSummary: parsed.parsed_summary,
    },
  });

  // Update invoice status based on parsed result
  const updates: { status?: string; promiseDate?: Date | null } = {};

  if (parsed.parsed_status === "promised" && parsed.parsed_promise_date) {
    updates.status = "promised";
    updates.promiseDate = new Date(parsed.parsed_promise_date);
  } else if (parsed.parsed_status === "disputed") {
    updates.status = "disputed";
  }

  if (Object.keys(updates).length > 0) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: updates,
    });
  }

  return NextResponse.json({
    ok: true,
    communicationId: communication.id,
    invoiceNumber: invoice.invoiceNumber,
    parsed: {
      status: parsed.parsed_status,
      promiseDate: parsed.parsed_promise_date,
      summary: parsed.parsed_summary,
      recommendedTone: parsed.recommended_tone,
      nextAction: parsed.next_action,
    },
    invoiceUpdated: Object.keys(updates).length > 0,
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 180;