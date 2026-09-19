import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { TAITO_FALL_2026_SESSIONS, taitoSessionDateTime } from "./session-schedule.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  ENGLISH_SCORE_DISCLAIMER,
  SAT_SCORE_DISCLAIMER,
  TAITO_FALL_2026_SESSION_AGENDAS,
  TAITO_FALL_AGENDA_CALLOUT_SEED_KEY,
  TAITO_FALL_AGENDA_OBJECTIVES_SEED_KEY,
  agendaCalloutConfig,
  agendaForDateKey,
  agendaObjectivesConfig,
  agendaSeedMarker,
  copyrightMarkerHits,
  expectedAgendaFamily,
  formatTutorNotes,
  isKnownInitialOct2Objectives,
  isSeededTutorNotes,
  planTaitoFallAgendaMatches,
  shouldReplaceTutorNotes,
} from "./taito-fall-2026-session-agendas.ts";

test("covers every Fall 2026 Taito schedule date with original coaching outlines", () => {
  assert.equal(TAITO_FALL_2026_SESSION_AGENDAS.length, 12);
  assert.deepEqual(
    TAITO_FALL_2026_SESSION_AGENDAS.map((agenda) => agenda.dateKey),
    TAITO_FALL_2026_SESSIONS.map((session) => session.dateKey),
  );
  for (const scheduled of TAITO_FALL_2026_SESSIONS) {
    const agenda = agendaForDateKey(scheduled.dateKey);
    assert.ok(agenda, `missing agenda for ${scheduled.dateKey}`);
    assert.equal(agenda.subject, scheduled.subject);
    assert.equal(agenda.family, expectedAgendaFamily(scheduled.dateKey));
    assert.ok(agenda.outline.length > 40);
    assert.equal(agenda.objectives.length, 3);
    assert.match(agenda.callout, /not an official/i);
    assert.equal(copyrightMarkerHits(formatTutorNotes(agenda)).length, 0);
    assert.equal(copyrightMarkerHits(agenda.outline).length, 0);
    assert.equal(copyrightMarkerHits(agenda.objectives.join("\n")).length, 0);
  }
});

test("SAT and English dates match the requested Taito Fall hours", () => {
  const sat = TAITO_FALL_2026_SESSION_AGENDAS.filter((agenda) => agenda.family === "sat");
  const english = TAITO_FALL_2026_SESSION_AGENDAS.filter(
    (agenda) => agenda.family === "english",
  );
  assert.deepEqual(
    sat.map((agenda) => agenda.dateKey),
    [
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
      "2026-10-30",
      "2026-11-06",
      "2026-11-20",
      "2026-11-27",
      "2026-12-11",
      "2026-12-18",
    ],
  );
  assert.deepEqual(
    english.map((agenda) => agenda.dateKey),
    ["2026-10-23", "2026-11-13", "2026-12-04"],
  );
  assert.equal(sat[0]?.callout, SAT_SCORE_DISCLAIMER);
  assert.equal(english[0]?.callout, ENGLISH_SCORE_DISCLAIMER);
});

test("tutor-note seed markers are idempotent and do not clobber custom text", () => {
  const agenda = agendaForDateKey("2026-10-02")!;
  const seeded = formatTutorNotes(agenda);
  assert.ok(seeded.startsWith(agendaSeedMarker("2026-10-02")));
  assert.ok(isSeededTutorNotes(seeded, "2026-10-02"));
  assert.equal(formatTutorNotes(agenda), seeded);
  assert.equal(shouldReplaceTutorNotes("", "2026-10-02"), true);
  assert.equal(shouldReplaceTutorNotes(seeded, "2026-10-02"), true);
  assert.equal(shouldReplaceTutorNotes("Tutor wrote their own plan", "2026-10-02"), false);
  assert.equal(
    shouldReplaceTutorNotes("Tutor wrote their own plan", "2026-10-02", true),
    true,
  );
});

test("student block configs carry stable seed keys for upsert", () => {
  const agenda = agendaForDateKey("2026-11-13")!;
  assert.deepEqual(agendaObjectivesConfig(agenda).seedKey, TAITO_FALL_AGENDA_OBJECTIVES_SEED_KEY);
  assert.deepEqual(agendaCalloutConfig(agenda).seedKey, TAITO_FALL_AGENDA_CALLOUT_SEED_KEY);
  assert.equal(
    isKnownInitialOct2Objectives({
      title: "Session goals",
      items: [
        "Review summer progress",
        "Complete a baseline timed mini-section",
        "Set measurable Fall goals",
      ],
    }),
    true,
  );
  assert.equal(
    isKnownInitialOct2Objectives({ title: "Session goals", items: ["Custom"] }),
    false,
  );
});

test("discovers keepers from schedule dates and never invents session IDs", () => {
  const taitoId = "taito-user";
  const otherClient = "michelle-user";
  const sessions = [
    {
      id: "live-oct-2",
      dateTime: taitoSessionDateTime("2026-10-02"),
      timezone: "Asia/Tokyo",
      subject: "SAT",
      title: "Taito’s SAT Session with Eunice",
      status: "published",
      bookingStatus: "confirmed",
      hasHomework: true,
      clientUserId: taitoId,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "dup-oct-2-archived",
      dateTime: taitoSessionDateTime("2026-10-02"),
      timezone: "Asia/Tokyo",
      subject: "SAT",
      title: "Taito’s SAT Session with Eunice",
      status: "archived",
      bookingStatus: "cancelled",
      clientUserId: taitoId,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    {
      id: "xavier-capability",
      dateTime: taitoSessionDateTime("2026-10-02"),
      timezone: "Asia/Tokyo",
      subject: "SAT",
      title: "SAT capability test — Xavier",
      status: "published",
      bookingStatus: "confirmed",
      clientUserId: taitoId,
    },
    {
      id: "michelle-oct-9",
      dateTime: taitoSessionDateTime("2026-10-09"),
      timezone: "Asia/Tokyo",
      subject: "SAT",
      title: "Michelle’s SAT Session with Xavier",
      status: "published",
      bookingStatus: "confirmed",
      clientUserId: otherClient,
    },
    {
      id: "nika-oct-23",
      dateTime: taitoSessionDateTime("2026-10-23"),
      timezone: "Asia/Tokyo",
      subject: "IELTS",
      title: "Taito’s English Session with Nika",
      status: "published",
      bookingStatus: "confirmed",
      clientUserId: taitoId,
    },
  ];

  const plan = planTaitoFallAgendaMatches(sessions, { taitoUserId: taitoId });
  assert.equal(plan.length, 12);
  assert.equal(plan.find((row) => row.dateKey === "2026-10-02")?.session?.id, "live-oct-2");
  assert.equal(plan.find((row) => row.dateKey === "2026-10-23")?.session?.id, "nika-oct-23");
  assert.equal(plan.find((row) => row.dateKey === "2026-10-09")?.session, undefined);
  assert.ok(
    plan.every(
      (row) =>
        row.session?.id !== "xavier-capability" && row.session?.id !== "invented",
    ),
  );
  assert.equal(plan.filter((row) => row.session).length, 2);
});
