import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  googleMeetUrl,
  normalizeAdminMeetUrl,
  resolveSessionMeetingUrl,
  SOPHIA_SLEIMAN_MEET_URL,
  studentFacingMeetingUrl,
} from "./session-meeting-url.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { NEEL_DHARNI_USER_ID } from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  SHARED_FALL_MEETING_URL,
  TAITO_STUDENT_EMAIL,
  taitoSessionDateTime,
} from "./session-schedule.ts";

const SOPHIA_DATES = [
  { dateKey: "2026-11-01", subject: "SAT" },
  { dateKey: "2026-11-04", subject: "SAT" },
  { dateKey: "2026-11-08", subject: "SAT" },
  { dateKey: "2026-11-11", subject: "SAT" },
  { dateKey: "2026-11-15", subject: "SAT" },
  { dateKey: "2026-11-18", subject: "SAT" },
  { dateKey: "2026-11-22", subject: "SAT" },
  { dateKey: "2026-11-25", subject: "SAT" },
  { dateKey: "2026-11-29", subject: "SAT" },
] as const;

test("an admin meetUrl wins over the calendar link and the course room", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: "https://meet.google.com/admin-room",
      providerEventUrl: "https://meet.google.com/provider-room",
      courseMeetUrl: "https://meet.google.com/course-room",
      clientUserId: "student-1",
      clientEmail: "student@example.invalid",
      dateTime: new Date("2026-11-02T15:00:00.000Z"),
      subject: "SAT",
      timezone: "America/New_York",
    }),
    "https://meet.google.com/admin-room",
  );
});

test("a session without meetUrl keeps a meet.google.com providerEventUrl", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: null,
      providerEventUrl: "https://meet.google.com/provider-room/",
      courseMeetUrl: "https://meet.google.com/course-room",
      clientUserId: "student-1",
      clientEmail: "student@example.invalid",
      dateTime: new Date("2026-11-02T15:00:00.000Z"),
      subject: "SAT",
      timezone: "America/New_York",
    }),
    "https://meet.google.com/provider-room",
  );
});

test("a non-meet providerEventUrl is not used as a join link", () => {
  assert.equal(
    googleMeetUrl("https://www.google.com/calendar/event?eid=abc123"),
    null,
  );
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: null,
      providerEventUrl: "https://www.google.com/calendar/event?eid=abc123",
      courseMeetUrl: "https://meet.google.com/course-room",
      clientUserId: "student-1",
      clientEmail: "student@example.invalid",
      dateTime: new Date("2026-11-02T15:00:00.000Z"),
      subject: "SAT",
      timezone: "America/New_York",
    }),
    "https://meet.google.com/course-room",
  );
});

test("a session with neither own link falls back the way Taito's Fall room does today", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: null,
      providerEventUrl: null,
      courseMeetUrl: null,
      term: "Fall 2026",
      clientEmail: TAITO_STUDENT_EMAIL,
      dateTime: taitoSessionDateTime("2026-10-02"),
      subject: "SAT",
      timezone: "Asia/Tokyo",
    }),
    SHARED_FALL_MEETING_URL,
  );
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: null,
      providerEventUrl: "https://www.google.com/calendar/event?eid=taito",
      courseMeetUrl: null,
      clientEmail: TAITO_STUDENT_EMAIL,
      dateTime: taitoSessionDateTime("2026-11-06"),
      subject: "SAT",
      timezone: "Asia/Tokyo",
    }),
    SHARED_FALL_MEETING_URL,
  );
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: null,
      providerEventUrl: null,
      courseMeetUrl: null,
      term: "Spring 2027",
      clientUserId: "student-1",
      clientEmail: "student@example.invalid",
      dateTime: new Date("2027-03-02T15:00:00.000Z"),
      subject: "SAT",
      timezone: "America/New_York",
    }),
    null,
  );
});

const HTML_LINK = "https://www.google.com/calendar/event?eid=abc123";
const MICHELLE = {
  clientUserId: "michelle-user",
  clientEmail: "michaelmakarem@gmail.com",
  dateTime: new Date("2026-11-02T15:00:00.000Z"),
  subject: "SAT",
  timezone: "America/New_York",
  term: "Fall 2026",
};

test("htmlLink only on a Fall course with the shared room resolves to the shared room", () => {
  assert.equal(googleMeetUrl(HTML_LINK), null);
  assert.equal(
    resolveSessionMeetingUrl({
      ...MICHELLE,
      meetUrl: null,
      providerEventUrl: HTML_LINK,
      courseMeetUrl: SHARED_FALL_MEETING_URL,
    }),
    SHARED_FALL_MEETING_URL,
  );
});

test("no provider url on a Fall course with the shared room resolves to the shared room", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      ...MICHELLE,
      meetUrl: null,
      providerEventUrl: null,
      courseMeetUrl: SHARED_FALL_MEETING_URL,
    }),
    SHARED_FALL_MEETING_URL,
  );
});

test("a providerEventUrl that is the shared room resolves to the shared room", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      ...MICHELLE,
      meetUrl: null,
      providerEventUrl: SHARED_FALL_MEETING_URL,
      courseMeetUrl: "https://meet.google.com/other-room",
    }),
    SHARED_FALL_MEETING_URL,
  );
});

test("Neel booking Nika still resolves to the shared room", () => {
  assert.equal(
    studentFacingMeetingUrl({
      clientUserId: NEEL_DHARNI_USER_ID,
      tutorName: "Nika Raiffe",
      tutorEmail: "nika.raiffe@gmail.com",
      meetUrl: null,
      providerEventUrl: HTML_LINK,
      courseMeetUrl: null,
      dateTime: new Date("2026-11-02T16:00:00.000Z"),
      subject: "College Consulting",
      timezone: "America/New_York",
    }),
    SHARED_FALL_MEETING_URL,
  );
});

test("Sophia with only a calendar htmlLink resolves to her room", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: null,
      providerEventUrl: HTML_LINK,
      courseMeetUrl: SHARED_FALL_MEETING_URL,
      term: "Fall 2026",
      clientUserId: SOPHIA_SLEIMAN_SAT_USER_ID,
      clientEmail: "sophia.sleiman@example.invalid",
      dateTime: new Date("2026-11-01T14:00:00.000Z"),
      subject: "SAT",
      timezone: "America/New_York",
    }),
    SOPHIA_SLEIMAN_MEET_URL,
  );
});

test("Sophia with sessions.meet_url set resolves to her room on every November date", () => {
  for (const session of SOPHIA_DATES) {
    assert.equal(
      resolveSessionMeetingUrl({
        meetUrl: SOPHIA_SLEIMAN_MEET_URL,
        providerEventUrl: HTML_LINK,
        courseMeetUrl: SHARED_FALL_MEETING_URL,
        term: "Fall 2026",
        clientUserId: SOPHIA_SLEIMAN_SAT_USER_ID,
        clientEmail: "sophia.sleiman@example.invalid",
        dateTime: new Date(`${session.dateKey}T14:00:00.000Z`),
        subject: session.subject,
        timezone: "America/New_York",
      }),
      SOPHIA_SLEIMAN_MEET_URL,
    );
  }
});

test("Taito's moved session resolves to the shared room", () => {
  const moved = taitoSessionDateTime("2026-10-31");
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: null,
      providerEventUrl: HTML_LINK,
      courseMeetUrl: SHARED_FALL_MEETING_URL,
      term: "Fall 2026",
      clientEmail: TAITO_STUDENT_EMAIL,
      dateTime: moved,
      subject: "SAT",
      timezone: "Asia/Tokyo",
    }),
    SHARED_FALL_MEETING_URL,
  );
});

test("a course with no meetUrl at all does not invent a join link", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: null,
      providerEventUrl: null,
      courseMeetUrl: null,
      term: "Spring 2027",
      clientUserId: "student-1",
      clientEmail: "student@example.invalid",
      dateTime: new Date("2027-03-02T15:00:00.000Z"),
      subject: "SAT",
      timezone: "America/New_York",
    }),
    null,
  );
});

test("Taito's Fall 2026 sessions stay on the shared room", () => {
  assert.equal(SHARED_FALL_MEETING_URL, "https://meet.google.com/rih-iayt-okb");
  assert.equal(
    resolveSessionMeetingUrl({
      meetUrl: SOPHIA_SLEIMAN_MEET_URL,
      providerEventUrl: SOPHIA_SLEIMAN_MEET_URL,
      courseMeetUrl: SOPHIA_SLEIMAN_MEET_URL,
      clientEmail: TAITO_STUDENT_EMAIL,
      dateTime: taitoSessionDateTime("2026-10-02"),
      subject: "SAT",
      timezone: "Asia/Tokyo",
    }),
    SHARED_FALL_MEETING_URL,
  );
});

test("Sophia's sessions resolve to her own Meet room", () => {
  assert.equal(SOPHIA_SLEIMAN_MEET_URL, "https://meet.google.com/xqq-zivk-ewx");
  assert.equal(SOPHIA_DATES.length, 9);
  for (const session of SOPHIA_DATES) {
    assert.equal(
      resolveSessionMeetingUrl({
        meetUrl: null,
        providerEventUrl: SOPHIA_SLEIMAN_MEET_URL,
        courseMeetUrl: SHARED_FALL_MEETING_URL,
        term: "Fall 2026",
        clientUserId: SOPHIA_SLEIMAN_SAT_USER_ID,
        clientEmail: "sophia.sleiman@example.invalid",
        dateTime: new Date(`${session.dateKey}T14:00:00.000Z`),
        subject: session.subject,
        timezone: "America/New_York",
      }),
      SOPHIA_SLEIMAN_MEET_URL,
    );
  }
  assert.equal(
    resolveSessionMeetingUrl({
      providerEventUrl: "https://www.google.com/calendar/event?eid=sophia",
      courseMeetUrl: SHARED_FALL_MEETING_URL,
      clientUserId: SOPHIA_SLEIMAN_SAT_USER_ID,
      clientEmail: "sophia.sleiman@example.invalid",
      dateTime: new Date("2026-11-01T14:00:00.000Z"),
      subject: "SAT",
      timezone: "America/New_York",
    }),
    SOPHIA_SLEIMAN_MEET_URL,
  );
});

test("admin meetUrl accepts a Meet link and null, and rejects other URLs", () => {
  assert.deepEqual(normalizeAdminMeetUrl(undefined), { ok: true, meetUrl: undefined });
  assert.deepEqual(normalizeAdminMeetUrl(null), { ok: true, meetUrl: null });
  assert.deepEqual(normalizeAdminMeetUrl("  "), { ok: true, meetUrl: null });
  assert.deepEqual(normalizeAdminMeetUrl("https://meet.google.com/abc-defg-hij/"), {
    ok: true,
    meetUrl: "https://meet.google.com/abc-defg-hij",
  });
  assert.deepEqual(normalizeAdminMeetUrl("https://www.google.com/calendar/event?eid=abc"), {
    ok: false,
  });
  assert.deepEqual(normalizeAdminMeetUrl("http://meet.google.com/abc-defg-hij"), { ok: false });
});
