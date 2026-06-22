import { Resend } from "resend";

/**
 * Email sending via Resend.
 *
 * In production: uses RESEND_API_KEY env var.
 * In demo/dev without keys: returns a mock success (email content
 * is still stored as a Communication row in the DB).
 */

let resend: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!resend) resend = new Resend(key);
  return resend;
}

export interface SendEmailParams {
  to: string;
  from?: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{
  sent: boolean;
  messageId?: string;
  error?: string;
  demo: boolean;
}> {
  const client = getClient();

  if (!client) {
    // No API key — demo mode. Don't actually send, but report success
    // so the UI flow works. The Communication row is still stored.
    console.log("[email] No RESEND_API_KEY — simulating send to:", params.to);
    return {
      sent: false,
      demo: true,
      messageId: `demo_${Date.now()}`,
    };
  }

  try {
    const from = params.from || process.env.EMAIL_FROM || "Cashflow Agent <noreply@cashflowagent.dev>";

    const { data, error } = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      replyTo: params.replyTo,
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return { sent: false, demo: false, error: error.message };
    }

    return {
      sent: true,
      demo: false,
      messageId: data?.id,
    };
  } catch (e: any) {
    console.error("[email] Send failed:", e);
    return { sent: false, demo: false, error: e.message };
  }
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}