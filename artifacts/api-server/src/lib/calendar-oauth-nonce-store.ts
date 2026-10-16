import { and, eq, isNull, sql } from "drizzle-orm";
import { calendarOauthNoncesTable, db } from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  calendarOAuthNonceAdmission,
  type CalendarOAuthNonceRejection,
} from "./calendar-oauth-nonce.ts";

export async function persistCalendarOAuthNonce(input: {
  nonce: string;
  tutorProfileId: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(calendarOauthNoncesTable).values({
    nonce: input.nonce,
    tutorProfileId: input.tutorProfileId,
    expiresAt: input.expiresAt,
  });
}

/** Burn a nonce on first use. A second callback with the same nonce is rejected. */
export async function consumeCalendarOAuthNonce(input: {
  nonce: string;
  tutorProfileId: string;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; reason: CalendarOAuthNonceRejection }> {
  const now = input.now ?? new Date();
  const consumed = await db
    .update(calendarOauthNoncesTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(calendarOauthNoncesTable.nonce, input.nonce),
        eq(calendarOauthNoncesTable.tutorProfileId, input.tutorProfileId),
        isNull(calendarOauthNoncesTable.usedAt),
        sql`${calendarOauthNoncesTable.expiresAt} > ${now}`,
      ),
    )
    .returning({ nonce: calendarOauthNoncesTable.nonce });
  if (consumed.length > 0) return { ok: true };

  const [row] = await db
    .select({
      nonce: calendarOauthNoncesTable.nonce,
      tutorProfileId: calendarOauthNoncesTable.tutorProfileId,
      expiresAt: calendarOauthNoncesTable.expiresAt,
      usedAt: calendarOauthNoncesTable.usedAt,
    })
    .from(calendarOauthNoncesTable)
    .where(eq(calendarOauthNoncesTable.nonce, input.nonce))
    .limit(1);
  return calendarOAuthNonceAdmission({
    nonce: input.nonce,
    tutorProfileId: input.tutorProfileId,
    record: row ?? null,
    now: now.getTime(),
  });
}
