import { prisma } from "@/lib/db";

export const DEMO_USER_EMAIL = "demo@cashflowagent.dev";

/**
 * Returns true when the request carries a `?demo=1` query parameter.
 *
 * SECURITY: Demo mode is disabled in production (NODE_ENV=production)
 * to prevent authentication bypass on mutating endpoints.
 */
export function isDemoRequest(req: Request): boolean {
  // Block demo mode in production
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEMO_IN_PROD !== "true") {
    return false;
  }
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