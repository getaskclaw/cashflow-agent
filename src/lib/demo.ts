import { prisma } from "@/lib/db";

export const DEMO_USER_EMAIL = "demo@cashflowagent.dev";

/**
 * Returns true when the request carries a `?demo=1` query parameter.
 * Used to bypass auth for hackathon demo videos.
 */
export function isDemoRequest(req: Request): boolean {
  try {
    return new URL(req.url).searchParams.get("demo") === "1";
  } catch {
    return false;
  }
}

/**
 * Resolves the seeded demo user's ID. Returns null if the demo user
 * has not been seeded into the database.
 */
export async function getDemoUserId(): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
    select: { id: true },
  });
  return user?.id ?? null;
}
