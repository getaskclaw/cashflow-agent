import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isDemoRequest, getDemoUserId } from "@/lib/demo";

/**
 * Create a new customer + invoice.
 *
 * Body: {
 *   customerName, customerEmail, customerPhone?, customerNotes?,
 *   invoiceNumber, amount (dollars), description, dueDate (YYYY-MM-DD)
 * }
 *
 * If the customer email already exists for this user, reuses the customer.
 */
export async function POST(req: Request) {
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

  let body: {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerNotes?: string;
    invoiceNumber?: string;
    amount?: number;
    description?: string;
    dueDate?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    customerName, customerEmail, customerPhone, customerNotes,
    invoiceNumber, amount, description, dueDate,
  } = body || {};

  // Validate required fields
  if (!customerName || !customerEmail) {
    return NextResponse.json({ error: "Customer name and email are required" }, { status: 400 });
  }
  if (!invoiceNumber) {
    return NextResponse.json({ error: "Invoice number is required" }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: "Due date must be YYYY-MM-DD" }, { status: 400 });
  }

  try {
    // Find or create customer
    let customer = await prisma.customer.findUnique({
      where: { userId_email: { userId, email: customerEmail } },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          userId,
          name: customerName,
          email: customerEmail,
          phone: customerPhone || null,
          notes: customerNotes || null,
        },
      });
    }

    // Check invoice number uniqueness
    const existingInvoice = await prisma.invoice.findUnique({
      where: { invoiceNumber },
      select: { id: true },
    });
    if (existingInvoice) {
      return NextResponse.json({ error: `Invoice ${invoiceNumber} already exists` }, { status: 409 });
    }

    // Create invoice (amount in cents)
    const invoice = await prisma.invoice.create({
      data: {
        userId,
        customerId: customer.id,
        invoiceNumber,
        amount: Math.round(amount * 100),
        currency: "usd",
        description: description || null,
        dueDate: new Date(dueDate),
        status: "pending",
      },
    });

    return NextResponse.json({
      ok: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: customer.name,
    });
  } catch (error: any) {
    console.error("Create invoice error:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";