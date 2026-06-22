import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const connection = await prisma.stripeConnection.findUnique({
    where: { userId },
  });

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const invoices = await prisma.invoice.findMany({
    where: { userId },
    include: {
      customer: { select: { name: true, email: true } },
      communications: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, direction: true, createdAt: true },
      },
    },
    orderBy: [
      { status: "asc" },
      { dueDate: "asc" },
    ],
  });

  const expectedThisWeek = invoices
    .filter((i) => i.status === "pending" && i.dueDate >= startOfWeek && i.dueDate <= endOfWeek)
    .reduce((sum, i) => sum + i.amount, 0);

  const overdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + i.amount, 0);

  const collectedThisWeek = invoices
    .filter((i) => i.status === "paid" && i.paidAt && i.paidAt >= startOfWeek)
    .reduce((sum, i) => sum + i.amount, 0);

  const atRisk = invoices
    .filter((i) => i.status === "promised" && i.promiseDate && i.promiseDate < now)
    .reduce((sum, i) => sum + i.amount, 0);

  return NextResponse.json({
    connected: !!connection,
    stripeAccountId: connection?.stripeAccountId || null,
    cashflow: {
      expectedThisWeek,
      overdue,
      collectedThisWeek,
      atRisk,
    },
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amount,
      currency: inv.currency,
      description: inv.description,
      status: inv.status,
      dueDate: inv.dueDate.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      promiseDate: inv.promiseDate?.toISOString() || null,
      paidAt: inv.paidAt?.toISOString() || null,
      customer: inv.customer,
      lastCommunication: inv.communications[0] || null,
    })),
  });
}

export const dynamic = "force-dynamic";
