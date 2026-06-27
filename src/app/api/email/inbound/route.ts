import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseReply } from "@/lib/agent";
import crypto from "crypto";

/**
 * Inbound email webhook — receives customer replies from Resend.
 *
 * Security:
 * 1. Validates Resend webhook signature (if RESEND_WEBHOOK_SECRET is set)
 * 2. Checks that the sender email matches the invoice's customer email
 * 3. If no secret is configured, rejects in production mode
 *
 * Uses TypeScript parseReply() directly — no Python subprocess.
 */

function verifyResendSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    let body: any;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Security: verify webhook signature
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    const signature = req.headers.get("x-resend-signature") || req.headers.get("resend-signature");

    if (process.env.NODE_ENV === "production" && !webhookSecret) {
      console.error("[inbound] RESEND_WEBHOOK_SECRET not set in production — rejecting");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 403 });
    }

    if (webhookSecret) {
      if (!verifyResendSignature(rawBody, signature, webhookSecret)) {
        console.warn("[inbound] Invalid webhook signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    } else if (process.env.NODE_ENV !== "production") {
      // Dev mode without secret — allow but log warning
      console.warn("[inbound] No webhook secret — accepting in dev mode only");
    }

    const from = body?.from || body?.sender || "";
    const to = body?.to || body?.recipient || "";
    const text = body?.text || body?.body || body?.content || "";

    if (!from || !text) {
      return NextResponse.json({ error: "Missing from or text" }, { status: 400 });
    }

    // Extract invoiceId from reply-to address
    const match = (typeof to === "string" ? to : "").match(/reply\+([a-zA-Z0-9]+)@/);
    const invoiceId = match?.[1];

    if (!invoiceId) {
      return NextResponse.json({ ok: true, message: "No invoice match — ignored" });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        userId: true,
        invoiceNumber: true,
        status: true,
        customer: { select: { email: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ ok: true, message: "Invoice not found — ignored" });
    }

    // Security: verify sender matches the invoice's customer email
    const senderEmail = from.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0]?.toLowerCase() || "";
    const customerEmail = invoice.customer.email.toLowerCase();

    if (senderEmail !== customerEmail) {
      console.warn(`[inbound] Sender ${senderEmail} does not match customer ${customerEmail} for invoice ${invoice.invoiceNumber}`);
      return NextResponse.json({ error: "Sender email does not match customer" }, { status: 403 });
    }

    // Parse the reply using TypeScript (replaces Python subprocess)
    let parsed: {
      parsedStatus: string;
      parsedPromiseDate: string | null;
      parsedSummary: string;
      recommendedTone: string;
      nextAction: string;
    };

    try {
      const result = await parseReply(invoiceId, text);
      parsed = {
        parsedStatus: result.parsedStatus,
        parsedPromiseDate: result.parsedPromiseDate,
        parsedSummary: result.parsedSummary,
        recommendedTone: result.recommendedTone,
        nextAction: result.nextAction,
      };
    } catch (e: any) {
      console.error("[inbound] Parse failed:", e?.message || e);
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

    const updates: { status: string; promiseDate?: Date } | null =
      parsed.parsedStatus === "promised" && parsed.parsedPromiseDate
        ? { status: "promised", promiseDate: new Date(parsed.parsedPromiseDate) }
        : parsed.parsedStatus === "disputed"
          ? { status: "disputed" }
          : null;

    await prisma.$transaction([
      prisma.communication.create({
        data: {
          invoiceId,
          direction: "inbound",
          channel: "email",
          content: text,
          parsedStatus: parsed.parsedStatus,
          parsedPromiseDate: parsed.parsedPromiseDate
            ? new Date(parsed.parsedPromiseDate)
            : null,
          parsedSummary: parsed.parsedSummary,
        },
      }),
      ...(updates
        ? [prisma.invoice.update({ where: { id: invoiceId }, data: updates })]
        : []),
    ]);

    console.log(`[inbound] Reply for ${invoice.invoiceNumber}: ${parsed.parsedStatus}`);

    return NextResponse.json({
      ok: true,
      invoiceNumber: invoice.invoiceNumber,
      parsedStatus: parsed.parsedStatus,
      parsedSummary: parsed.parsedSummary,
    });
  } catch (error: any) {
    console.error("[inbound] Webhook error:", error?.message || error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 180;