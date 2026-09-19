import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { assignEnglishPreworkFromBank } from "./ielts-style-bank.ts";
import { assignPreworkFromBank } from "./sat-bank-service.ts";
import { isEnglishSessionSubject } from "./session-schedule.ts";

export async function assignSessionPreworkFromBank(
  input: Parameters<typeof assignPreworkFromBank>[0] & { setIndex?: number },
) {
  const [session] = await db
    .select({ subject: sessionsTable.subject })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, input.sessionId))
    .limit(1);
  if (!session) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }
  if (isEnglishSessionSubject(session.subject)) {
    return assignEnglishPreworkFromBank(input);
  }
  return assignPreworkFromBank(input);
}
