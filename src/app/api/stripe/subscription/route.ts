import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PLAN_LIMITS } from "@/lib/subscription";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });

  const invoiceCount = await prisma.invoice.count({
    where: { userId: session.user.id },
  });

  const plan = (sub?.plan as keyof typeof PLAN_LIMITS) || "free";
  const limits = PLAN_LIMITS[plan];

  return NextResponse.json({
    plan,
    status: sub?.status || "active",
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() || null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd || false,
    invoiceCount,
    invoiceLimit: limits.invoices === Infinity ? -1 : limits.invoices,
    planLabel: limits.label,
    planPrice: limits.price,
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
