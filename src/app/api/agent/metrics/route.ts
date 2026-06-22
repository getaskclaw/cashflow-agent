import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";

/**
 * Collection metrics — computed from invoice + communication data.
 *
 * Returns:
 * - collectionRate: % of overdue invoices that eventually got paid
 * - avgDaysToPay: average days between due date and paid date
 * - totalRecovered: sum of paid invoice amounts
 * - totalOutstanding: sum of overdue + promised amounts
 * - followUpsSent: total outbound communications
 * - promiseKeepRate: % of promises that were kept (invoice paid by promise date)
 * - escalationRate: % of invoices that needed 2+ follow-ups
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

  const allInvoices = await prisma.invoice.findMany({
    where: { userId },
    select: {
      id: true,
      amount: true,
      status: true,
      dueDate: true,
      paidAt: true,
      promiseDate: true,
      createdAt: true,
      communications: {
        where: { direction: "outbound" },
        select: { id: true },
      },
    },
  });

  const totalInvoices = allInvoices.length;
  const paidInvoices = allInvoices.filter((i) => i.status === "paid");
  const overdueInvoices = allInvoices.filter((i) => i.status === "overdue");
  const promisedInvoices = allInvoices.filter((i) => i.status === "promised");

  // Collection rate: paid / (paid + overdue + promised) — invoices that were
  // once overdue and got resolved
  const resolvable = paidInvoices.length + overdueInvoices.length + promisedInvoices.length;
  const collectionRate = resolvable > 0
    ? Math.round((paidInvoices.length / resolvable) * 100)
    : 0;

  // Avg days to pay
  const daysToPay = paidInvoices
    .filter((i) => i.paidAt)
    .map((i) => {
      const diff = i.paidAt!.getTime() - i.dueDate.getTime();
      return Math.max(0, Math.floor(diff / 86400000));
    });
  const avgDaysToPay = daysToPay.length > 0
    ? Math.round(daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length)
    : 0;

  // Total recovered
  const totalRecovered = paidInvoices.reduce((sum, i) => sum + i.amount, 0);

  // Total outstanding
  const totalOutstanding = [...overdueInvoices, ...promisedInvoices]
    .reduce((sum, i) => sum + i.amount, 0);

  // Follow-ups sent
  const followUpsSent = allInvoices.reduce((sum, i) => sum + i.communications.length, 0);

  // Promise keep rate
  const promisesMade = allInvoices.filter((i) => i.promiseDate !== null);
  const promisesKept = promisesMade.filter(
    (i) => i.status === "paid" && i.paidAt && i.paidAt <= i.promiseDate!
  );
  const promiseKeepRate = promisesMade.length > 0
    ? Math.round((promisesKept.length / promisesMade.length) * 100)
    : 0;

  // Escalation rate — invoices with 2+ follow-ups
  const escalated = allInvoices.filter((i) => i.communications.length >= 2);
  const escalationRate = totalInvoices > 0
    ? Math.round((escalated.length / totalInvoices) * 100)
    : 0;

  return NextResponse.json({
    collectionRate,
    avgDaysToPay,
    totalRecovered,
    totalOutstanding,
    followUpsSent,
    promiseKeepRate,
    escalationRate,
    invoiceCounts: {
      total: totalInvoices,
      paid: paidInvoices.length,
      overdue: overdueInvoices.length,
      promised: promisedInvoices.length,
    },
  });
}

export const dynamic = "force-dynamic";