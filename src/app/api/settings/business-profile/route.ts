import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/business-profile";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getBusinessProfile(session.user.id);
  return NextResponse.json(profile);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate allowed fields
  const allowed = ["companyName", "senderName", "senderEmail", "locale", "baseCurrency", "vatNumber"];
  const filtered: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) filtered[key] = body[key];
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const profile = await upsertBusinessProfile(session.user.id, filtered);
  return NextResponse.json(profile);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
