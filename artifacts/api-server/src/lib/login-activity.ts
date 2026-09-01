import { db, loginActivityTable } from "@workspace/db";

export async function recordSuccessfulLogin(
  userId: string,
  clerkSessionId: string | null | undefined,
): Promise<void> {
  if (!clerkSessionId) return;
  await db
    .insert(loginActivityTable)
    .values({ userId, clerkSessionId })
    .onConflictDoNothing({ target: loginActivityTable.clerkSessionId });
}