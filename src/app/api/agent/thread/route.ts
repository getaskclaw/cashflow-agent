import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";

export async function GET(req: Request) {
  let userId: string;

  if (isDemoRequest(req)) {
    const demoId = await getDemoUserId();
    if (!demoId) {
      return NextResponse.json(
        { error: "Demo user not seeded." },
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

  const url = new URL(req.url);
  const invoiceId = url.searchParams.get("invoiceId");

  if (!invoiceId) {
    return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: { select: { name: true, email: true, phone: true, notes: true } },
      communications: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          channel: true,
          content: true,
          agentDraft: true,
          approved: true,
          sentAt: true,
          createdAt: true,
          parsedStatus: true,
          parsedPromiseDate: true,
          parsedSummary: true,
        },
      },
    },
  });

  if (!invoice || invoice.userId !== userId) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return NextResponse.json({
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      currency: invoice.currency,
      description: invoice.description,
      dueDate: invoice.dueDate.toISOString(),
      status: invoice.status,
      promiseDate: invoice.promiseDate?.toISOString() || null,
      paidAt: invoice.paidAt?.toISOString() || null,
      paymentLinkId: invoice.paymentLinkId,
    },
    customer: invoice.customer,
    communications: invoice.communications.map((c) => ({
      id: c.id,
      direction: c.direction,
      channel: c.channel,
      content: c.content,
      agentDraft: c.agentDraft,
      approved: c.approved,
      sentAt: c.sentAt?.toISOString() || null,
      createdAt: c.createdAt.toISOString(),
      parsedStatus: c.parsedStatus,
      parsedPromiseDate: c.parsedPromiseDate?.toISOString() || null,
      parsedSummary: c.parsedSummary,
    })),
  });
}

export const dynamic = "force-dynamic";