import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import {
  generateAvailableSlots,
  zonedDateTimeToUtc,
  type AvailabilityRule,
} from "./booking.ts";
import { mergeDateHours } from "./self-serve-availability.ts";
import {
  NIKA_CLOSE_ALL_ACTION,
  NIKA_CLOSE_ALL_CUTOFF,
  NIKA_CLOSURE_FAR_DATE,
  NIKA_PRE_CLOSE_OPENINGS,
  ensureNikaAllHoursClosed,
  planNikaCloseAll,
  type NikaHoursSnapshot,
} from "./nika-close-all-hours.ts";
import { NIKA_TUTOR_PROFILE_ID } from "./self-serve-availability.ts";

const weeklyFallback = Object.fromEntries(
  ["0", "1", "2", "3", "4", "5", "6"].map((day) => [day, [{ start: "07:00", end: "21:00" }]]),
);

function storedBeforeClose(): NikaHoursSnapshot {
  const dateHours: Record<string, { start: string; end: string }[]> = {};
  for (const key of [
    "2026-10-17",
    "2026-10-18",
    "2026-10-20",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
    "2026-11-15",
    NIKA_CLOSURE_FAR_DATE,
  ]) {
    dateHours[key] = [];
  }
  return {
    dateHours: { ...dateHours, ...NIKA_PRE_CLOSE_OPENINGS },
    recurringHours: { startDate: "2026-10-26", endDate: null, days: { "1": [{ start: "21:00", end: "22:00" }] } },
    weeklyHours: weeklyFallback,
    updatedAt: new Date("2026-10-23T13:27:05.596Z"),
  };
}

function ruleFrom(snapshot: {
  dateHours: AvailabilityRule["dateHours"];
  recurringHours: AvailabilityRule["recurringHours"];
  weeklyHours: AvailabilityRule["weeklyHours"];
}): AvailabilityRule {
  return {
    timezone: "America/New_York",
    weeklyHours: snapshot.weeklyHours,
    dateHours: snapshot.dateHours,
    recurringHours: snapshot.recurringHours,
    bookingNoticeMinutes: 0,
    bufferMinutes: 0,
    blackoutDates: [],
  };
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function eachDate(fromDay: string, toDay: string): string[] {
  const dates: string[] = [];
  for (let date = fromDay; date <= toDay; date = nextDate(date)) dates.push(date);
  return dates;
}

function slotsBetween(hours: AvailabilityRule, fromDay: string, toDay: string) {
  return generateAvailableSlots(
    hours,
    zonedDateTimeToUtc(fromDay, "00:00", "America/New_York"),
    zonedDateTimeToUtc(toDay, "00:00", "America/New_York"),
    60,
    [],
    [],
    new Date("2026-10-01T15:00:00.000Z"),
  );
}

after(async () => {
  await pool.end();
});

test("closing Nika leaves no bookable slot, then a saved date or weekly schedule opens", () => {
  const before = storedBeforeClose();
  assert.ok(slotsBetween(ruleFrom(before), "2026-10-26", "2026-10-27").length > 0);
  assert.ok(slotsBetween(ruleFrom(before), "2026-11-16", "2026-11-17").length > 0);

  const plan = planNikaCloseAll({ hasMarker: false, rule: before });
  assert.equal(plan.action, "applied");
  if (plan.action !== "applied") return;
  assert.deepEqual(Object.keys(plan.dateHours), [NIKA_CLOSURE_FAR_DATE]);
  assert.deepEqual(plan.dateHours[NIKA_CLOSURE_FAR_DATE], []);
  assert.deepEqual(plan.recurringHours, { startDate: null, endDate: null, days: {} });
  assert.deepEqual(plan.weeklyHours, {});

  const closed = ruleFrom(plan);
  assert.deepEqual(slotsBetween(closed, "2026-10-26", "2026-12-21"), []);
  assert.deepEqual(slotsBetween(closed, "2026-10-27", "2026-11-16"), []);
  assert.deepEqual(slotsBetween(closed, "2026-11-16", "2026-11-24"), []);
  assert.deepEqual(slotsBetween(closed, "2027-03-01", "2027-03-08"), []);
  assert.deepEqual(slotsBetween(closed, "2100-01-03", "2100-01-10"), []);

  const savedDate = mergeDateHours(plan.dateHours, {
    "2026-11-02": [{ start: "16:00", end: "17:00" }],
  });
  const openedDate = ruleFrom({ ...plan, dateHours: savedDate });
  assert.deepEqual(slotsBetween(openedDate, "2026-11-02", "2026-11-03"), [
    zonedDateTimeToUtc("2026-11-02", "16:00", "America/New_York").toISOString(),
  ]);
  assert.deepEqual(slotsBetween(openedDate, "2026-11-16", "2026-11-17"), []);
  assert.deepEqual(slotsBetween(openedDate, "2026-10-27", "2026-11-02"), []);
});

test("a save after the cutoff is kept and the old openings still close", () => {
  const later = storedBeforeClose();
  later.updatedAt = new Date(NIKA_CLOSE_ALL_CUTOFF.getTime() + 60_000);
  later.dateHours = {
    ...later.dateHours,
    "2026-12-01": [{ start: "10:00", end: "11:00" }],
  };
  later.recurringHours = {
    startDate: "2026-11-01",
    endDate: null,
    days: { "2": [{ start: "18:00", end: "19:00" }] },
  };
  const plan = planNikaCloseAll({ hasMarker: false, rule: later });
  assert.equal(plan.action, "preserved-later-save");
  if (plan.action !== "preserved-later-save") return;
  assert.equal(plan.dateHours["2026-10-26"], undefined);
  assert.equal(plan.dateHours["2026-10-27"], undefined);
  assert.equal(plan.dateHours["2026-11-15"], undefined);
  assert.deepEqual(plan.dateHours[NIKA_CLOSURE_FAR_DATE], []);
  assert.deepEqual(plan.dateHours["2026-12-01"], [{ start: "10:00", end: "11:00" }]);
  assert.deepEqual(plan.recurringHours.days["2"], [{ start: "18:00", end: "19:00" }]);
  assert.equal(plan.recurringHours.days["1"], undefined);
  assert.deepEqual(plan.weeklyHours, {});
  const keptWeekly = ruleFrom(plan);
  assert.deepEqual(slotsBetween(keptWeekly, "2026-10-27", "2026-10-28"), []);
  for (const date of ["2026-11-03", "2026-11-10"]) {
    assert.deepEqual(slotsBetween(keptWeekly, date, nextDate(date)), [
      zonedDateTimeToUtc(date, "18:00", "America/New_York").toISOString(),
    ]);
  }
  assert.deepEqual(slotsBetween(keptWeekly, "2026-11-16", "2026-11-17"), []);
  assert.deepEqual(slotsBetween(keptWeekly, "2026-11-23", "2026-11-24"), []);
  assert.equal(planNikaCloseAll({ hasMarker: true, rule: later }).action, "already-applied");
  assert.equal(planNikaCloseAll({ hasMarker: false, rule: null }).action, "missing");
});

test("a weekly schedule saved after the cutoff opens Oct 27 through Nov 15", () => {
  const later = storedBeforeClose();
  later.updatedAt = new Date(NIKA_CLOSE_ALL_CUTOFF.getTime() + 60_000);
  later.recurringHours = {
    startDate: null,
    endDate: null,
    days: Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((day) => [day, [{ start: "10:00", end: "11:00" }]])),
  };
  const plan = planNikaCloseAll({ hasMarker: false, rule: later });
  assert.equal(plan.action, "preserved-later-save");
  if (plan.action !== "preserved-later-save") return;
  assert.equal(plan.dateHours["2026-10-27"], undefined);
  assert.equal(plan.dateHours["2026-11-15"], undefined);
  assert.deepEqual(plan.dateHours[NIKA_CLOSURE_FAR_DATE], []);
  const hours = ruleFrom(plan);
  for (const date of eachDate("2026-10-27", "2026-11-15")) {
    assert.deepEqual(slotsBetween(hours, date, nextDate(date)), [
      zonedDateTimeToUtc(date, "10:00", "America/New_York").toISOString(),
    ]);
  }
  assert.deepEqual(slotsBetween(hours, "2026-11-16", "2026-11-17"), [
    zonedDateTimeToUtc("2026-11-16", "10:00", "America/New_York").toISOString(),
  ]);
});

test("a single-date save after the cutoff does not revive the old weekly hours", () => {
  const later = storedBeforeClose();
  later.updatedAt = new Date(NIKA_CLOSE_ALL_CUTOFF.getTime() + 60_000);
  later.dateHours = {
    ...later.dateHours,
    "2026-11-04": [{ start: "15:00", end: "16:00" }],
  };
  const plan = planNikaCloseAll({ hasMarker: false, rule: later });
  assert.equal(plan.action, "preserved-later-save");
  if (plan.action !== "preserved-later-save") return;
  assert.deepEqual(plan.recurringHours, { startDate: null, endDate: null, days: {} });
  assert.deepEqual(plan.weeklyHours, {});
  assert.deepEqual(plan.dateHours["2026-11-04"], [{ start: "15:00", end: "16:00" }]);
  assert.equal(plan.dateHours["2026-10-27"], undefined);
  assert.equal(plan.dateHours["2026-11-15"], undefined);
  assert.deepEqual(plan.dateHours[NIKA_CLOSURE_FAR_DATE], []);
  const hours = ruleFrom(plan);
  assert.deepEqual(slotsBetween(hours, "2026-11-04", "2026-11-05"), [
    zonedDateTimeToUtc("2026-11-04", "15:00", "America/New_York").toISOString(),
  ]);
  assert.deepEqual(slotsBetween(hours, "2026-10-27", "2026-11-04"), []);
  assert.deepEqual(slotsBetween(hours, "2026-11-05", "2026-11-16"), []);
  assert.deepEqual(slotsBetween(hours, "2026-11-16", "2026-11-24"), []);
});

test("a post-cutoff single-date save leaves no fallback slots", () => {
  const later = storedBeforeClose();
  later.updatedAt = new Date(NIKA_CLOSE_ALL_CUTOFF.getTime() + 60_000);
  later.weeklyHours = Object.fromEntries(
    ["0", "1", "2", "3", "4", "5", "6"].map((day) => [day, [{ start: "09:00", end: "17:00" }]]),
  );
  later.dateHours = {
    ...later.dateHours,
    "2026-11-04": [{ start: "15:00", end: "16:00" }],
  };
  const plan = planNikaCloseAll({ hasMarker: false, rule: later });
  assert.equal(plan.action, "preserved-later-save");
  if (plan.action !== "preserved-later-save") return;
  assert.deepEqual(plan.weeklyHours, {});
  assert.deepEqual(plan.recurringHours, { startDate: null, endDate: null, days: {} });
  assert.deepEqual(plan.dateHours["2026-11-04"], [{ start: "15:00", end: "16:00" }]);
  const hours = ruleFrom(plan);
  assert.deepEqual(slotsBetween(hours, "2026-10-26", "2026-11-04"), []);
  assert.deepEqual(slotsBetween(hours, "2026-11-04", "2026-11-05"), [
    zonedDateTimeToUtc("2026-11-04", "15:00", "America/New_York").toISOString(),
  ]);
  assert.deepEqual(slotsBetween(hours, "2026-11-05", "2026-12-21"), []);
  assert.deepEqual(slotsBetween(hours, "2100-01-03", "2100-01-10"), []);
});

test("startup closes Nika once and does not rewrite sessions or send mail", async () => {
  const source = await readFile(fileURLToPath(new URL("./nika-close-all-hours.ts", import.meta.url)), "utf8");
  const startup = await readFile(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8");
  assert.match(startup, /ensureNikaAllHoursClosed\(\)/);
  assert.doesNotMatch(source, /sessionsTable|sendEmail|nodemailer|resend|clerkClient|calendar/i);
  assert.match(source, new RegExp(NIKA_CLOSE_ALL_ACTION));
});

test("startup closure is idempotent, keeps a later save, and leaves the booked session", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required");
    return;
  }
  const client = await pool.connect();
  const email = `nika-close-all-${Date.now()}@example.invalid`;
  const profileId = NIKA_TUTOR_PROFILE_ID;
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM audit_logs WHERE action = $1 AND entity_id = $2`,
      [NIKA_CLOSE_ALL_ACTION, profileId],
    );
    await client.query(`DELETE FROM availability_rules WHERE tutor_profile_id = $1`, [profileId]);
    await client.query(`DELETE FROM tutor_profiles WHERE id = $1`, [profileId]);
    await client.query("COMMIT");

    await client.query(
      `INSERT INTO tutor_profiles (id, email, name, title, active)
       VALUES ($1, $2, 'Nika Raiffe', 'Tutor', true)`,
      [profileId, email],
    );
    const before = storedBeforeClose();
    await client.query(
      `INSERT INTO availability_rules
         (tutor_profile_id, timezone, weekly_hours, date_hours, recurring_hours, updated_at)
       VALUES ($1, 'America/New_York', $2::jsonb, $3::jsonb, $4::jsonb, $5)`,
      [
        profileId,
        JSON.stringify(before.weeklyHours),
        JSON.stringify(before.dateHours),
        JSON.stringify(before.recurringHours),
        before.updatedAt.toISOString(),
      ],
    );
    const sessionsBefore = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM sessions`);

    const first = await ensureNikaAllHoursClosed(new Date("2026-10-26T12:40:00.000Z"));
    assert.equal(first.action, "applied");
    const second = await ensureNikaAllHoursClosed(new Date("2026-10-26T12:41:00.000Z"));
    assert.equal(second.action, "already-applied");

    const closed = await client.query<{
      date_hours: Record<string, { start: string; end: string }[]>;
      recurring_hours: { days?: Record<string, unknown> };
      weekly_hours: Record<string, unknown>;
    }>(
      `SELECT date_hours, recurring_hours, weekly_hours
       FROM availability_rules WHERE tutor_profile_id = $1`,
      [profileId],
    );
    const dateHours = closed.rows[0]?.date_hours ?? {};
    assert.equal(dateHours["2026-10-26"], undefined);
    assert.equal(dateHours["2026-10-27"], undefined);
    assert.equal(dateHours["2026-11-15"], undefined);
    assert.deepEqual(dateHours[NIKA_CLOSURE_FAR_DATE], []);
    assert.deepEqual(Object.keys(dateHours), [NIKA_CLOSURE_FAR_DATE]);
    assert.deepEqual(closed.rows[0]?.weekly_hours, {});
    assert.deepEqual(closed.rows[0]?.recurring_hours.days ?? {}, {});
    assert.deepEqual(
      slotsBetween(
        ruleFrom({
          dateHours,
          recurringHours: { startDate: null, endDate: null, days: {} },
          weeklyHours: {},
        }),
        "2026-10-26",
        "2026-12-21",
      ),
      [],
    );

    const opened = {
      ...dateHours,
      "2026-11-02": [{ start: "16:00", end: "17:00" }],
    };
    await client.query(
      `UPDATE availability_rules
       SET date_hours = $2::jsonb,
           recurring_hours = '{"startDate":null,"endDate":null,"days":{"1":[{"start":"16:00","end":"17:00"}]}}'::jsonb,
           updated_at = $3
       WHERE tutor_profile_id = $1`,
      [profileId, JSON.stringify(opened), "2026-10-26T13:00:00.000Z"],
    );
    const third = await ensureNikaAllHoursClosed(new Date("2026-10-26T13:05:00.000Z"));
    assert.equal(third.action, "already-applied");
    const kept = await client.query<{
      date_hours: Record<string, { start: string; end: string }[]>;
      recurring_hours: { days?: Record<string, { start: string; end: string }[]> };
    }>(
      `SELECT date_hours, recurring_hours FROM availability_rules WHERE tutor_profile_id = $1`,
      [profileId],
    );
    assert.deepEqual(kept.rows[0]?.date_hours["2026-11-02"], [{ start: "16:00", end: "17:00" }]);
    assert.deepEqual(kept.rows[0]?.recurring_hours.days?.["1"], [{ start: "16:00", end: "17:00" }]);

    const sessionsAfter = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM sessions`);
    assert.equal(sessionsAfter.rows[0]?.count, sessionsBefore.rows[0]?.count);
  } finally {
    await client.query(`DELETE FROM audit_logs WHERE action = $1 AND entity_id = $2`, [
      NIKA_CLOSE_ALL_ACTION,
      profileId,
    ]);
    await client.query(`DELETE FROM availability_rules WHERE tutor_profile_id = $1`, [profileId]);
    await client.query(`DELETE FROM tutor_profiles WHERE id = $1`, [profileId]);
    client.release();
  }
});
