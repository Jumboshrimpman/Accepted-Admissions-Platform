import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  coursePageJoinMeetUrl,
  googleMeetUrl,
  MICHELLE_MAKAREM_MEET_URL,
  normalizeAdminMeetUrl,
  persistableDedicatedMeetUrl,
  pinnedBookingMeetUrl,
  resolveSessionMeetingUrl,
  SOPHIA_LAMAS_MEET_URL,
  SOPHIA_SLEIMAN_MEET_URL,
  sophiaLamasMeetUrl,
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

test("a non-Taito Fall course does not fall back to Taito's shared room", () => {
  assert.equal(googleMeetUrl(HTML_LINK), null);
  assert.equal(
    resolveSessionMeetingUrl({
      ...MICHELLE,
      meetUrl: null,
      providerEventUrl: HTML_LINK,
      courseMeetUrl: SHARED_FALL_MEETING_URL,
    }),
    null,
  );
});

test("no provider url on a Fall course does not invent Taito's room for another student", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      ...MICHELLE,
      meetUrl: null,
      providerEventUrl: null,
      courseMeetUrl: SHARED_FALL_MEETING_URL,
    }),
    null,
  );
});

test("a providerEventUrl that is Taito's room is ignored for another student", () => {
  assert.equal(
    resolveSessionMeetingUrl({
      ...MICHELLE,
      meetUrl: null,
      providerEventUrl: SHARED_FALL_MEETING_URL,
      courseMeetUrl: "https://meet.google.com/other-room",
    }),
    "https://meet.google.com/other-room",
  );
});

test("Neel booking Nika does not use Taito's room and waits for a persisted hangoutLink", () => {
  assert.equal(
    studentFacingMeetingUrl({
      clientUserId: NEEL_DHARNI_USER_ID,
      tutorName: "Nika Raiffe",
      tutorEmail: "nika.raiffe@gmail.com",
      meetUrl: null,
      providerEventUrl: HTML_LINK,
      courseMeetUrl: SHARED_FALL_MEETING_URL,
      dateTime: new Date("2026-11-02T16:00:00.000Z"),
      subject: "College Consulting",
      timezone: "America/New_York",
    }),
    null,
  );
  const neelRoom = "https://meet.google.com/abc-defg-hij";
  assert.equal(
    studentFacingMeetingUrl({
      clientUserId: NEEL_DHARNI_USER_ID,
      tutorName: "Nika Raiffe",
      tutorEmail: "nika.raiffe@gmail.com",
      dedicatedMeetUrl: neelRoom,
    }),
    neelRoom,
  );
  assert.equal(
    studentFacingMeetingUrl({
      clientUserId: NEEL_DHARNI_USER_ID,
      tutorName: "Nika Raiffe",
      tutorEmail: "nika.raiffe@gmail.com",
      dedicatedMeetUrl: SHARED_FALL_MEETING_URL,
    }),
    null,
  );
  assert.equal(persistableDedicatedMeetUrl(SHARED_FALL_MEETING_URL), null);
  assert.equal(persistableDedicatedMeetUrl(neelRoom), neelRoom);
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

test("Sophia Lamas the tutor does not use Sophia Sleiman's room or the shared Fall room", () => {
  assert.equal(SOPHIA_LAMAS_MEET_URL, "https://meet.google.com/ase-tqtz-ywj");
  assert.equal(SOPHIA_SLEIMAN_MEET_URL, "https://meet.google.com/xqq-zivk-ewx");
  assert.equal(SHARED_FALL_MEETING_URL, "https://meet.google.com/rih-iayt-okb");
  assert.notEqual(SOPHIA_LAMAS_MEET_URL, SOPHIA_SLEIMAN_MEET_URL);
  assert.notEqual(SOPHIA_LAMAS_MEET_URL, SHARED_FALL_MEETING_URL);
  assert.equal(googleMeetUrl(SOPHIA_LAMAS_MEET_URL), SOPHIA_LAMAS_MEET_URL);
  assert.equal(
    sophiaLamasMeetUrl({
      tutorName: "Sophia Lamas",
      tutorEmail: "other@example.com",
    }),
    SOPHIA_LAMAS_MEET_URL,
  );
  assert.equal(
    sophiaLamasMeetUrl({
      tutorName: "Nika Raiffe",
      tutorEmail: "sophia.e.lamas@gmail.com",
    }),
    SOPHIA_LAMAS_MEET_URL,
  );
  assert.equal(
    sophiaLamasMeetUrl({
      tutorName: "Xavier Morales",
      tutorEmail: "xavier.rmz6@gmail.com",
    }),
    null,
  );
  assert.equal(
    pinnedBookingMeetUrl({
      tutorName: "Sophia Lamas",
      tutorEmail: "sophia.e.lamas@gmail.com",
    }),
    SOPHIA_LAMAS_MEET_URL,
  );
  assert.equal(
    pinnedBookingMeetUrl({
      tutorName: "Nika Raiffe",
      tutorEmail: "nika.raiffe@gmail.com",
    }),
    null,
  );
  assert.equal(
    studentFacingMeetingUrl({
      clientUserId: "b21bc32a-82c3-4252-a702-daa3fcdd23af",
      tutorName: "Sophia Lamas",
      tutorEmail: "sophia.e.lamas@gmail.com",
    }),
    SOPHIA_LAMAS_MEET_URL,
  );
  assert.equal(
    studentFacingMeetingUrl({
      clientUserId: SOPHIA_SLEIMAN_SAT_USER_ID,
      tutorName: "Sophia Lamas",
      tutorEmail: "sophia.e.lamas@gmail.com",
    }),
    SOPHIA_LAMAS_MEET_URL,
  );
  assert.notEqual(
    pinnedBookingMeetUrl({
      tutorName: "Sophia Lamas",
      tutorEmail: "sophia.e.lamas@gmail.com",
    }),
    SOPHIA_SLEIMAN_MEET_URL,
  );
  assert.notEqual(
    pinnedBookingMeetUrl({
      tutorName: "Sophia Lamas",
      tutorEmail: "sophia.e.lamas@gmail.com",
    }),
    SHARED_FALL_MEETING_URL,
  );
});


const MICHELLE_SHARED_FALL_INPUT = {
  meetUrl: null,
  providerEventUrl: "https://www.google.com/calendar/event?eid=michelle-xavier",
  courseMeetUrl: SHARED_FALL_MEETING_URL,
  term: "Fall 2026",
  clientUserId: MICHELLE_MAKAREM_USER_ID,
  clientEmail: "makaremmichelle7@gmail.com",
  dateTime: new Date("2026-11-22T17:00:00.000Z"),
  subject: "SAT",
  timezone: "America/New_York",
  tutorName: "Xavier Morales",
  tutorEmail: "xavier.rmz6@gmail.com",
} as const;

test("Michelle's sessions with any tutor use her dedicated room in the portal and on new booking invites", () => {
  assert.equal(MICHELLE_MAKAREM_MEET_URL, "https://meet.google.com/ase-tqtz-ywj");
  assert.equal(MICHELLE_MAKAREM_MEET_URL, SOPHIA_LAMAS_MEET_URL);
  assert.equal(studentFacingMeetingUrl(MICHELLE_SHARED_FALL_INPUT), MICHELLE_MAKAREM_MEET_URL);
  assert.equal(
    studentFacingMeetingUrl({
      ...MICHELLE_SHARED_FALL_INPUT,
      meetUrl: SHARED_FALL_MEETING_URL,
      tutorName: "Eunice Chon",
      tutorEmail: "eunice_chon@berkeley.edu",
    }),
    SHARED_FALL_MEETING_URL,
  );
  // Existing Nov 22-style rows can still follow an explicit meet_url so the
  // portal matches a button that has not been moved yet. New bookings persist ase.
  assert.equal(
    studentFacingMeetingUrl({
      ...MICHELLE_SHARED_FALL_INPUT,
      tutorName: "Sophia Lamas",
      tutorEmail: "sophia.e.lamas@gmail.com",
    }),
    MICHELLE_MAKAREM_MEET_URL,
  );
  assert.equal(
    pinnedBookingMeetUrl({
      tutorName: "Xavier Morales",
      tutorEmail: "xavier.rmz6@gmail.com",
      clientUserId: MICHELLE_MAKAREM_USER_ID,
      clientEmail: "makaremmichelle7@gmail.com",
    }),
    MICHELLE_MAKAREM_MEET_URL,
  );
  assert.equal(
    pinnedBookingMeetUrl({
      tutorName: "Eunice Chon",
      tutorEmail: "eunice_chon@berkeley.edu",
      clientUserId: MICHELLE_MAKAREM_USER_ID,
    }),
    MICHELLE_MAKAREM_MEET_URL,
  );
});

test("Michelle's portal Join follows an explicit session.meet_url even when it is not her dedicated room", () => {
  assert.equal(
    studentFacingMeetingUrl({
      ...MICHELLE_SHARED_FALL_INPUT,
      meetUrl: SHARED_FALL_MEETING_URL,
    }),
    SHARED_FALL_MEETING_URL,
  );
  assert.equal(
    studentFacingMeetingUrl({
      ...MICHELLE_SHARED_FALL_INPUT,
      meetUrl: null,
    }),
    MICHELLE_MAKAREM_MEET_URL,
  );
  assert.equal(
    pinnedBookingMeetUrl({
      tutorName: "Xavier Morales",
      tutorEmail: "xavier.rmz6@gmail.com",
      clientUserId: MICHELLE_MAKAREM_USER_ID,
      clientEmail: "makaremmichelle7@gmail.com",
    }),
    MICHELLE_MAKAREM_MEET_URL,
  );
});

test("Sophia S stays on xqq, Taito stays on rih, and Neel does not inherit Taito's room", () => {
  assert.equal(
    studentFacingMeetingUrl({
      courseMeetUrl: SHARED_FALL_MEETING_URL,
      term: "Fall 2026",
      clientUserId: SOPHIA_SLEIMAN_SAT_USER_ID,
      clientEmail: "sophiasleiman13@gmail.com",
      dateTime: new Date("2026-11-18T15:00:00.000Z"),
      subject: "SAT English",
      timezone: "America/New_York",
      tutorName: "Eunice Chon",
      tutorEmail: "eunice_chon@berkeley.edu",
    }),
    SOPHIA_SLEIMAN_MEET_URL,
  );
  assert.equal(
    studentFacingMeetingUrl({
      courseMeetUrl: SHARED_FALL_MEETING_URL,
      term: "Fall 2026",
      clientEmail: TAITO_STUDENT_EMAIL,
      dateTime: taitoSessionDateTime("2026-11-20"),
      subject: "SAT",
      timezone: "Asia/Tokyo",
      tutorName: "Eunice Chon",
      tutorEmail: "eunice_chon@berkeley.edu",
    }),
    SHARED_FALL_MEETING_URL,
  );
  assert.equal(
    studentFacingMeetingUrl({
      courseMeetUrl: SHARED_FALL_MEETING_URL,
      clientUserId: NEEL_DHARNI_USER_ID,
      tutorName: "Nika Raiffe",
      tutorEmail: "nika.raiffe@gmail.com",
    }),
    null,
  );
  assert.equal(
    pinnedBookingMeetUrl({
      tutorName: "Eunice Chon",
      tutorEmail: "eunice_chon@berkeley.edu",
      clientUserId: SOPHIA_SLEIMAN_SAT_USER_ID,
      clientEmail: "sophiasleiman13@gmail.com",
    }),
    SOPHIA_SLEIMAN_MEET_URL,
  );
});

test("the course page Join Meet button uses the next session's resolved URL and hides when none remain", () => {
  const now = new Date("2026-11-16T16:00:00.000Z");
  assert.equal(
    coursePageJoinMeetUrl(
      [
        {
          dateTime: new Date("2026-11-16T14:00:00.000Z"),
          durationMinutes: 60,
          meetingUrl: SHARED_FALL_MEETING_URL,
        },
        {
          dateTime: new Date("2026-11-22T17:00:00.000Z"),
          durationMinutes: 60,
          meetingUrl: MICHELLE_MAKAREM_MEET_URL,
        },
        {
          dateTime: new Date("2026-11-29T15:00:00.000Z"),
          durationMinutes: 90,
          meetingUrl: SOPHIA_SLEIMAN_MEET_URL,
        },
      ],
      now,
    ),
    MICHELLE_MAKAREM_MEET_URL,
  );
  assert.equal(
    coursePageJoinMeetUrl(
      [
        {
          dateTime: new Date("2026-11-16T15:30:00.000Z"),
          durationMinutes: 60,
          meetingUrl: MICHELLE_MAKAREM_MEET_URL,
        },
      ],
      now,
    ),
    MICHELLE_MAKAREM_MEET_URL,
  );
  assert.equal(
    coursePageJoinMeetUrl(
      [
        {
          dateTime: new Date("2026-11-22T17:00:00.000Z"),
          durationMinutes: 60,
          bookingStatus: "cancelled",
          meetingUrl: MICHELLE_MAKAREM_MEET_URL,
        },
      ],
      now,
    ),
    null,
  );
  assert.equal(coursePageJoinMeetUrl([], now), null);
});


test("GET /courses/:courseId pins Join Meet to the viewer's next session URL, not the shared course room", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const start = platform.indexOf('router.get("/courses/:courseId"');
  const end = platform.indexOf("async function reviewSubmissionsForUser");
  const handler = platform.slice(start, end);
  assert.match(handler, /meetUrl: coursePageJoinMeetUrl\(/);
  assert.doesNotMatch(handler, /meetUrl: meetingUrlForTerm\(/);
});
