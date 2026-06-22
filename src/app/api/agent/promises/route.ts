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

  const now = new Date();

  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      status: "promised",
      promiseDate: { not: null },
    },
    include: {
      customer: { select: { name: true, email: true } },
      communications: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true },
      },
    },
    orderBy: { promiseDate: "asc" },
  });

  const promises = invoices.map((inv) => {
    const promiseDate = inv.promiseDate!;
    const diffMs = promiseDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffMs / 86400000);
    const isBroken = daysUntil < 0;

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amount,
      currency: inv.currency,
      customerName: inv.customer.name,
      customerEmail: inv.customer.email,
      promiseDate: promiseDate.toISOString(),
      daysUntil,
      isBroken,
      urgency: isBroken ? "broken" : daysUntil <= 2 ? "critical" : daysUntil <= 7 ? "soon" : "ok",
      lastMessage: inv.communications[0]?.content || null,
    };
  });

  return NextResponse.json({ promises, total: promises.length });
}

export const dynamic = "force-dynamic";