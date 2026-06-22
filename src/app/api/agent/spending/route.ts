import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";

/**
 * Returns the agent's spending ledger — transactions the agent
 * created when sending follow-ups (email delivery costs).
 *
 * Each approve creates a Transaction with:
 *   stripeChargeId = `agent_send_${invoiceId}_${timestamp}`
 *   description = "Email delivery — INV-XXXX"
 *   amount = 25 (¢) — symbolic $0.25 per send
 *
 * Also returns totals: total spent, total earned (collected),
 * net position.
 */
export async function GET(req: Request) {
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

  try {
    // Agent spending = transactions with stripeChargeId starting "agent_send_"
    const spending = await prisma.transaction.findMany({
      where: {
        userId,
        stripeChargeId: { startsWith: "agent_send_" },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const totalSpent = spending.reduce((sum, t) => sum + t.amount, 0);

    // Agent earned = invoices that went from overdue/promised → paid
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        userId,
        status: "paid",
        paidAt: { not: null },
      },
      select: { amount: true, paidAt: true },
    });

    const totalEarned = paidInvoices.reduce((sum, inv) => sum + inv.amount, 0);

    // Net = earned - spent (in cents)
    const net = totalEarned - totalSpent;

    return NextResponse.json({
      spending: spending.map((t) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
      totals: {
        spent: totalSpent,
        earned: totalEarned,
        net,
        sendCount: spending.length,
      },
    });
  } catch (error: any) {
    console.error("Spending API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load spending" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";