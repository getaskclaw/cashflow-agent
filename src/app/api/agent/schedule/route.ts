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

  let body: { invoiceId?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { invoiceId, date } = body || {};

  if (!invoiceId || typeof invoiceId !== "string") {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }
  if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid date (expected YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  // Verify ownership.
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { userId: true, invoiceNumber: true },
  });
  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const env = {
    ...process.env,
    CASHFLOW_DB: process.env.CASHFLOW_DB || undefined,
  };

  try {
    const proc = await execFileAsync(
      PYTHON,
      [`${SCRIPTS_DIR}/schedule_followup.py`, invoiceId, date],
      { env, timeout: 90_000, maxBuffer: 4 * 1024 * 1024 }
    );

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(proc.stdout);
    } catch {
      parsed = { raw: proc.stdout };
    }

    if (parsed && (parsed as { error?: string }).error) {
      return NextResponse.json(
        { error: `schedule_followup: ${(parsed as { error: string }).error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      invoiceNumber: invoice.invoiceNumber,
      targetDate: date,
      schedule: (parsed as { schedule?: string })?.schedule || null,
      cronJobId: (parsed as { cron_job_id?: string })?.cron_job_id || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Agent error: ${msg}` },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 120;
