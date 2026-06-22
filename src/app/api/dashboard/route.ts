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

  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: { taxCalculation: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const stats = await prisma.$transaction(async (tx) => {
    const totalRevenue = await tx.transaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    const totalTax = await tx.taxCalculation.aggregate({
      where: { userId },
      _sum: { taxAmount: true },
    });
    const count = await tx.transaction.count({ where: { userId } });
    const taxCount = await tx.taxCalculation.count({ where: { userId } });
    return { totalRevenue, totalTax, count, taxCount };
  });

  return NextResponse.json({
    connected: !!connection,
    stripeAccountId: connection?.stripeAccountId || null,
    stats: {
      totalRevenueCents: stats.totalRevenue._sum.amount || 0,
      totalTaxCents: stats.totalTax._sum.taxAmount || 0,
      transactionCount: stats.count,
      taxCalculatedCount: stats.taxCount,
    },
    transactions: transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      currency: t.currency,
      customerName: t.customerName,
      customerCountry: t.customerCountry,
      createdAt: t.createdAt.toISOString(),
      taxCalculation: t.taxCalculation
        ? {
            jurisdictionName: t.taxCalculation.jurisdictionName,
            jurisdictionCode: t.taxCalculation.jurisdictionCode,
            taxRate: t.taxCalculation.taxRate,
            taxAmount: t.taxCalculation.taxAmount,
            status: t.taxCalculation.status,
          }
        : null,
    })),
  });
}

export const dynamic = "force-dynamic";
