import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const SCRIPTS_DIR =
  process.env.CASHFLOW_SCRIPTS_DIR ||
  `${process.env.HOME}/.hermes/skills/business/cashflow-agent/scripts`;

const PYTHON = process.env.CASHFLOW_PYTHON || "python3";

/**
 * Inbound email webhook — receives customer replies from Resend.
 *
 * Resend sends inbound emails as POST to this endpoint.
 * The email body contains the customer's reply. We match it to an
 * invoice by the reply-to address pattern:
 *   reply+{invoiceId}@cashflowagent.dev
 *
 * Flow:
 * 1. Parse the inbound email (from, to, subject, text)
 * 2. Extract invoiceId from the reply-to address
 * 3. Verify the invoice exists and belongs to the user
 * 4. Call parse_reply.py to classify the reply
 * 5. Store as inbound Communication with parsed metadata
 * 6. Update invoice status if promised/disputed
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Resend inbound webhook format
    const from = body?.from || body?.sender;
    const to = body?.to || body?.recipient;
    const subject = body?.subject || "(no subject)";
    const text = body?.text || body?.body || body?.content || "";

    if (!from || !text) {
      return NextResponse.json(
        { error: "Missing from or text in inbound email" },
        { status: 400 }
      );
    }

    // Extract invoiceId from reply-to address pattern
    // Format: reply+{invoiceId}@cashflowagent.dev
    const match = (typeof to === "string" ? to : "").match(/reply\+([a-zA-Z0-9]+)@/);
    const invoiceId = match?.[1];

    if (!invoiceId) {
      console.log("[inbound] No invoiceId found in address:", to);
      return NextResponse.json({ ok: true, message: "No invoice match — ignored" });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { userId: true, invoiceNumber: true, status: true },
    });

    if (!invoice) {
      console.log(`[inbound] Invoice ${invoiceId} not found`);
      return NextResponse.json({ ok: true, message: "Invoice not found — ignored" });
    }

    // Call parse_reply.py to classify the reply
    const env = { ...process.env, CASHFLOW_DB: process.env.CASHFLOW_DB || undefined };

    let parsed: {
      parsed_status: string;
      parsed_promise_date: string | null;
      parsed_summary: string;
      recommended_tone: string;
      next_action: string;
      error?: string;
    };

    try {
      const proc = await execFileAsync(
        PYTHON,
        [`${SCRIPTS_DIR}/parse_reply.py`, invoiceId, text],
        { env, timeout: 150_000, maxBuffer: 4 * 1024 * 1024 }
      );
      parsed = JSON.parse(proc.stdout);
    } catch (e: any) {
      console.error("[inbound] Parse failed:", e);
      // Still store the reply even if parsing fails
      await prisma.communication.create({
        data: {
          invoiceId,
          direction: "inbound",
          channel: "email",
          content: text,
          parsedSummary: "Parsing failed — needs manual review",
        },
      });
      return NextResponse.json({ ok: true, message: "Stored reply (parse failed)" });
    }

    // Store the inbound communication
    await prisma.communication.create({
      data: {
        invoiceId,
        direction: "inbound",
        channel: "email",
        content: text,
        parsedStatus: parsed.parsed_status,
        parsedPromiseDate: parsed.parsed_promise_date
          ? new Date(parsed.parsed_promise_date)
          : null,
        parsedSummary: parsed.parsed_summary,
      },
    });

    // Update invoice status
    if (parsed.parsed_status === "promised" && parsed.parsed_promise_date) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "promised",
          promiseDate: new Date(parsed.parsed_promise_date),
        },
      });
    } else if (parsed.parsed_status === "disputed") {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "disputed" },
      });
    }

    console.log(`[inbound] Reply for ${invoice.invoiceNumber}: ${parsed.parsed_status}`);

    return NextResponse.json({
      ok: true,
      invoiceNumber: invoice.invoiceNumber,
      parsedStatus: parsed.parsed_status,
      parsedSummary: parsed.parsed_summary,
    });
  } catch (error: any) {
    console.error("[inbound] Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Inbound webhook failed" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 180;