import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";
import { sendEmail } from "@/lib/email";

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

  let body: {
    invoiceId?: string;
    draftText?: string;
    tone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { invoiceId, draftText, tone } = body || {};

  if (!invoiceId || typeof invoiceId !== "string") {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }
  if (!draftText || typeof draftText !== "string" || !draftText.trim()) {
    return NextResponse.json({ error: "Missing draftText" }, { status: 400 });
  }

  // Verify ownership and get customer + invoice details for email
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      userId: true,
      invoiceNumber: true,
      amount: true,
      currency: true,
      paymentLinkId: true,
      customer: { select: { name: true, email: true } },
    },
  });
  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Server-side payment link insertion: if the draft doesn't contain
  // a payment URL but one exists, append it
  let finalDraftText = draftText.trim();
  if (invoice.paymentLinkId && invoice.paymentLinkId.startsWith("http") &&
      !finalDraftText.includes(invoice.paymentLinkId)) {
    finalDraftText += `\n\nPay online: ${invoice.paymentLinkId}`;
  }

  // Actually send the email FIRST — if this fails, we don't record anything
  const replyToDomain = process.env.EMAIL_DOMAIN || "cashflowagent.dev";
  const emailResult = await sendEmail({
    to: invoice.customer.email,
    subject: `Follow-up: Invoice ${invoice.invoiceNumber} (${new Intl.NumberFormat("en-GB", { style: "currency", currency: invoice.currency.toUpperCase() }).format(invoice.amount / 100)})`,
    text: finalDraftText,
    replyTo: `reply+${invoiceId}@${replyToDomain}`,
  });

  // If email failed in production (not demo mode), don't record as sent
  if (!emailResult.sent && !emailResult.demo) {
    return NextResponse.json(
      { error: "Email send failed", emailError: emailResult.error },
      { status: 502 }
    );
  }

  // Record communication + spending atomically in a single transaction
  const [communication] = await prisma.$transaction([
    prisma.communication.create({
      data: {
        invoiceId,
        direction: "outbound",
        channel: "email",
        content: finalDraftText,
        agentDraft: true,
        approved: true,
        sentAt: emailResult.sent ? new Date() : null,
        parsedSummary: tone ? `Approved draft (tone: ${tone})` : "Approved draft",
      },
    }),
    prisma.transaction.create({
      data: {
        userId,
        stripeChargeId: `agent_send_${invoiceId}_${Date.now()}`,
        amount: 25, // $0.25 in cents — symbolic email delivery cost
        currency: "usd",
        customerName: emailResult.sent ? "Email Delivery (Resend)" : "Email Delivery (simulated)",
        description: `Agent email send — ${invoice.invoiceNumber}`,
        createdAt: new Date(),
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    communicationId: communication.id,
    emailSent: emailResult.sent,
    emailDemo: emailResult.demo,
    emailError: emailResult.error,
  });
}

export const dynamic = "force-dynamic";
