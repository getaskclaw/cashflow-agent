import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (!invoice || invoice.userId !== session.user.id) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

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

  return NextResponse.json({ ok: true, communicationId: communication.id });
}

export const dynamic = "force-dynamic";
