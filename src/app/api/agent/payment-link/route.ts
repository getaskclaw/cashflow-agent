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
  `${process.cwd()}/hermes-skill/scripts`;

const PYTHON = process.env.CASHFLOW_PYTHON || "python3";

/**
 * Creates a Stripe payment link for an invoice by calling the
 * existing create_payment_link.py script. In demo mode (no Stripe
 * keys), returns a mock link.
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

  // Verify ownership
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { userId: true, invoiceNumber: true, amount: true, currency: true, description: true },
  });
  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // If already has a payment link, return it
  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { paymentLinkId: true },
  });
  if (existing?.paymentLinkId) {
    return NextResponse.json({
      ok: true,
      invoiceNumber: invoice.invoiceNumber,
      paymentLinkId: existing.paymentLinkId,
      paymentLinkUrl: existing.paymentLinkId,
      existing: true,
    });
  }

  // Check if Stripe is configured
  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;

  if (!hasStripeKey || isDemoRequest(req)) {
    // Demo mode — return a mock payment link
    const mockUrl = `https://pay.stripe.com/demo_${invoice.invoiceNumber.toLowerCase()}_${Date.now().toString(36)}`;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { paymentLinkId: mockUrl },
    });
    return NextResponse.json({
      ok: true,
      invoiceNumber: invoice.invoiceNumber,
      paymentLinkId: mockUrl,
      paymentLinkUrl: mockUrl,
      demo: true,
    });
  }

  // Real Stripe — call the Python script
  const env = { ...process.env, CASHFLOW_DB: process.env.CASHFLOW_DB || undefined };

  try {
    const proc = await execFileAsync(
      PYTHON,
      [`${SCRIPTS_DIR}/create_payment_link.py`, invoiceId],
      { env, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }
    );
    const parsed = JSON.parse(proc.stdout);

    if (parsed.error) {
      return NextResponse.json({ error: `create_payment_link: ${parsed.error}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      invoiceNumber: invoice.invoiceNumber,
      paymentLinkId: parsed.payment_link_id || parsed.url || null,
      paymentLinkUrl: parsed.url || parsed.payment_link_url || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Payment link failed:" }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 90;