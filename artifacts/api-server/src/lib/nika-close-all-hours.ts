// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { and, eq } from "drizzle-orm";
import { auditLogsTable, availabilityRulesTable, db } from "@workspace/db";
import {
  normalizeRecurringHours,
  type AvailabilityWindow,
  type RecurringHours,
} from "./booking.ts";
import { NIKA_TUTOR_PROFILE_ID } from "./self-serve-availability.ts";

/** Sama authorized this close at 8:27 AM ET on Oct 26, 2026. */
export const NIKA_CLOSE_ALL_CUTOFF = new Date("2026-10-26T12:27:00.000Z");
export const NIKA_CLOSE_ALL_ACTION = "availability.nika_all_hours_closed";
export const NIKA_CLOSURE_FAR_DATE = "2099-12-31";

/**
 * Non-empty date windows stored for Nika when the close was authorized.
 * A later save that still matches one of these is the old opening, not hours
 * she added herself. Anything else is left in place.
 */
export const NIKA_PRE_CLOSE_OPENINGS: Record<string, AvailabilityWindow[]> = {
  "2026-10-19": [{ start: "21:00", end: "22:00" }],
  "2026-10-21": [{ start: "18:05", end: "19:30" }],
  "2026-10-22": [
    { start: "16:00", end: "17:00" },
    { start: "18:00", end: "19:00" },
  ],
  "2026-10-23": [{ start: "16:00", end: "20:00" }],
  "2026-10-24": [{ start: "13:00", end: "20:00" }],
  "2026-10-25": [{ start: "13:00", end: "20:00" }],
  "2026-10-26": [{ start: "21:00", end: "22:00" }],
};

const EMPTY_RECURRING: RecurringHours = { startDate: null, endDate: null, days: {} };

export type NikaCloseAllAction =
  | "applied"
  | "preserved-later-save"
  | "already-applied"
  | "missing"
  | "retry";

export type NikaHoursSnapshot = {
  dateHours: Record<string, AvailabilityWindow[]>;
  recurringHours: unknown;
  weeklyHours: Record<string, AvailabilityWindow[]>;
  updatedAt: Date;
};

function sameWindows(
  left: readonly AvailabilityWindow[] | undefined,
  right: readonly AvailabilityWindow[] | undefined,
): boolean {
  const actual = left ?? [];
  const expected = right ?? [];
  if (actual.length !== expected.length) return false;
  return actual.every(
    (window, index) => window.start === expected[index]?.start && window.end === expected[index]?.end,
  );
}

function asDateHours(value: unknown): Record<string, AvailabilityWindow[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const dateHours: Record<string, AvailabilityWindow[]> = {};
  for (const [key, windows] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(windows)) continue;
    dateHours[key] = windows.flatMap((window) => {
      if (!window || typeof window !== "object") return [];
      const start = (window as { start?: unknown }).start;
      const end = (window as { end?: unknown }).end;
      if (typeof start !== "string" || typeof end !== "string") return [];
      return [{ start, end }];
    });
  }
  return dateHours;
}

function asWeeklyHours(value: unknown): Record<string, AvailabilityWindow[]> {
  return asDateHours(value);
}

/**
 * Close every opening that was already stored. A weekly schedule or date she
 * saves after the cutoff stays. Explicit empty dates stay empty, so a later
 * weekly schedule still opens only dates she has not set. The far date keeps
 * the closed span in place when she has no weekly schedule.
 */
export function planNikaCloseAll(input: {
  hasMarker: boolean;
  rule: NikaHoursSnapshot | null;
}):
  | { action: "already-applied" | "missing" }
  | {
      action: "applied" | "preserved-later-save";
      dateHours: Record<string, AvailabilityWindow[]>;
      recurringHours: RecurringHours;
      weeklyHours: Record<string, AvailabilityWindow[]>;
    } {
  if (input.hasMarker) return { action: "already-applied" };
  if (!input.rule) return { action: "missing" };
  const preserveLaterSave = input.rule.updatedAt.getTime() > NIKA_CLOSE_ALL_CUTOFF.getTime();
  const dateHours: Record<string, AvailabilityWindow[]> = {};
  for (const [key, windows] of Object.entries(input.rule.dateHours)) {
    if (windows.length === 0) {
      dateHours[key] = [];
      continue;
    }
    if (!preserveLaterSave || sameWindows(windows, NIKA_PRE_CLOSE_OPENINGS[key])) {
      dateHours[key] = [];
      continue;
    }
    dateHours[key] = windows.map((window) => ({ ...window }));
  }
  if ((dateHours[NIKA_CLOSURE_FAR_DATE] ?? []).length === 0) {
    dateHours[NIKA_CLOSURE_FAR_DATE] = [];
  }
  const recurring = normalizeRecurringHours(input.rule.recurringHours);
  const keepRecurring = preserveLaterSave && Object.keys(recurring.days).length > 0;
  return {
    action: preserveLaterSave ? "preserved-later-save" : "applied",
    dateHours,
    recurringHours: keepRecurring ? recurring : EMPTY_RECURRING,
    weeklyHours: {},
  };
}

export async function ensureNikaAllHoursClosed(now = new Date()): Promise<{ action: NikaCloseAllAction }> {
  return db.transaction(async (tx) => {
    const [marker] = await tx
      .select({ id: auditLogsTable.id })
      .from(auditLogsTable)
      .where(
        and(
          eq(auditLogsTable.action, NIKA_CLOSE_ALL_ACTION),
          eq(auditLogsTable.entityType, "tutor_profile"),
          eq(auditLogsTable.entityId, NIKA_TUTOR_PROFILE_ID),
        ),
      )
      .limit(1);
    const [rule] = await tx
      .select({
        dateHours: availabilityRulesTable.dateHours,
        recurringHours: availabilityRulesTable.recurringHours,
        weeklyHours: availabilityRulesTable.weeklyHours,
        updatedAt: availabilityRulesTable.updatedAt,
      })
      .from(availabilityRulesTable)
      .where(eq(availabilityRulesTable.tutorProfileId, NIKA_TUTOR_PROFILE_ID))
      .limit(1);
    const plan = planNikaCloseAll({
      hasMarker: Boolean(marker),
      rule: rule
        ? {
            dateHours: asDateHours(rule.dateHours),
            recurringHours: rule.recurringHours,
            weeklyHours: asWeeklyHours(rule.weeklyHours),
            updatedAt: rule.updatedAt,
          }
        : null,
    });
    if (plan.action === "already-applied" || plan.action === "missing") return plan;
    const [saved] = await tx
      .update(availabilityRulesTable)
      .set({
        dateHours: plan.dateHours,
        recurringHours: plan.recurringHours,
        weeklyHours: plan.weeklyHours,
        updatedAt: now,
      })
      .where(
        and(
          eq(availabilityRulesTable.tutorProfileId, NIKA_TUTOR_PROFILE_ID),
          eq(availabilityRulesTable.updatedAt, rule!.updatedAt),
        ),
      )
      .returning({ id: availabilityRulesTable.id });
    if (!saved) return { action: "retry" };
    await tx.insert(auditLogsTable).values({
      action: NIKA_CLOSE_ALL_ACTION,
      entityType: "tutor_profile",
      entityId: NIKA_TUTOR_PROFILE_ID,
      metadata: { preservedLaterSave: plan.action === "preserved-later-save" },
    });
    return { action: plan.action };
  });
}
