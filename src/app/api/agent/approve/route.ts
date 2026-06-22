import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";

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

  // Verify ownership.
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { userId: true },
  });
  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Record the approved outbound communication
  const communication = await prisma.communication.create({
    data: {
      invoiceId,
      direction: "outbound",
      channel: "email",
      content: draftText.trim(),
      agentDraft: true,
      approved: true,
      sentAt: new Date(),
      parsedSummary: tone ? `Approved draft (tone: ${tone})` : "Approved draft",
    },
  });

  // Record agent spending — symbolic email delivery cost
  // This is the "spend" story for the hackathon: the agent pays for
  // its own email delivery via Stripe. $0.25 per send.
  const invoiceRecord = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { invoiceNumber: true },
  });

  await prisma.transaction.create({
    data: {
      userId,
      stripeChargeId: `agent_send_${invoiceId}_${Date.now()}`,
      amount: 25, // $0.25 in cents — symbolic email delivery cost
      currency: "usd",
      customerName: "Email Delivery (SendGrid)",
      description: `Agent email send — ${invoiceRecord?.invoiceNumber || invoiceId}`,
      createdAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, communicationId: communication.id });
}

export const dynamic = "force-dynamic";
