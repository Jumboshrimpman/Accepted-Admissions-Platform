import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  bookingCalendarEventPayload,
  calendarEventPayload,
} from "./booking.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  NEEL_DHARNI_USER_ID,
  NEEL_PLACEHOLDER_EMAIL,
  NIKA_CONSULTING_EMAIL,
  VICTORIA_PLACEHOLDER_EMAIL,
} from "./college-consulting.ts";
import {
  adminAttendeeEmailsForPair,
  mergeCalendarAttendees,
  MICHELLE_MAKAREM_CLERK_USER_ID,
  MICHELLE_MAKAREM_EMAIL,
} from "./calendar-pair-attendees.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { ADMIN_INBOX_EMAIL } from "./transactional-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  CANONICAL_XAVIER_CLERK_USER_ID,
  CANONICAL_XAVIER_EMAIL,
} from "./xavier-identity.ts";

const MEET_URL = "https://meet.google.com/rih-iayt-okb";
const START = new Date("2026-08-31T13:00:00.000Z");
const ADMIN = "admin@acceptedadmissions.org";

const michelle = {
  clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID,
  email: MICHELLE_MAKAREM_EMAIL,
};
const xavier = {
  clerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
  email: CANONICAL_XAVIER_EMAIL,
};

function invite(
  attendeeEmail: string,
  student: { clerkUserId?: string | null; email?: string | null } | null,
  tutor: { clerkUserId?: string | null; email?: string | null } | null,
) {
  return bookingCalendarEventPayload({
    title: "Michelle’s SAT Session with Xavier",
    start: START,
    durationMinutes: 60,
    timeZone: "America/New_York",
    attendeeEmail,
    location: MEET_URL,
    student,
    tutor,
  });
}

test("every booking invites admin@, including Michelle+Xavier and unrelated pairs", () => {
  assert.equal(ADMIN_INBOX_EMAIL, ADMIN);
  assert.deepEqual(adminAttendeeEmailsForPair(michelle, xavier), [ADMIN]);
  assert.deepEqual(adminAttendeeEmailsForPair(null, null), [ADMIN]);
  assert.deepEqual(adminAttendeeEmailsForPair(michelle, null), [ADMIN]);
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { userId: NEEL_DHARNI_USER_ID, email: NEEL_PLACEHOLDER_EMAIL },
      { email: NIKA_CONSULTING_EMAIL },
    ),
    [ADMIN],
  );
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { email: "taito0525@gmail.com" },
      { email: "eunice_chon@berkeley.edu" },
    ),
    [ADMIN],
  );
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { clerkUserId: "user_student", email: "student@example.com" },
      { email: VICTORIA_PLACEHOLDER_EMAIL },
    ),
    [ADMIN],
  );
});

test("Michelle with Xavier keeps the student on the same Meet invite and adds admin once", () => {
  const event = invite(MICHELLE_MAKAREM_EMAIL, michelle, xavier);
  assert.equal(event.summary, "Michelle’s SAT Session with Xavier");
  assert.equal(event.location, MEET_URL);
  assert.equal(event.start.dateTime, "2026-08-31T13:00:00.000Z");
  assert.equal(event.start.timeZone, "America/New_York");
  assert.equal(event.end.dateTime, "2026-08-31T14:00:00.000Z");
  assert.deepEqual(event.attendees, [
    { email: MICHELLE_MAKAREM_EMAIL },
    { email: ADMIN },
  ]);

  const alreadyInvited = invite(ADMIN, michelle, xavier);
  assert.deepEqual(alreadyInvited.attendees, [{ email: ADMIN }]);

  const differentCase = calendarEventPayload(
    "Michelle’s SAT Session with Xavier",
    START,
    60,
    "America/New_York",
    "Admin@AcceptedAdmissions.org",
    MEET_URL,
    { student: michelle, tutor: xavier },
  );
  assert.deepEqual(differentCase.attendees, [{ email: "Admin@AcceptedAdmissions.org" }]);
});

test("other bookings keep their own attendee and also include admin", () => {
  const event = invite("taito0525@gmail.com", {
    clerkUserId: "user_taito",
    email: "taito0525@gmail.com",
  }, {
    clerkUserId: "user_eunice",
    email: "eunice_chon@berkeley.edu",
  });
  assert.equal(event.location, MEET_URL);
  assert.deepEqual(event.attendees, [
    { email: "taito0525@gmail.com" },
    { email: ADMIN },
  ]);

  const unchanged = calendarEventPayload(
    "SAT session",
    START,
    60,
    "America/New_York",
    "michelle@example.com",
    MEET_URL,
  );
  assert.deepEqual(unchanged.attendees, [
    { email: "michelle@example.com" },
    { email: ADMIN },
  ]);
});

test("merging attendees is idempotent and does not drop existing guests", () => {
  assert.deepEqual(
    mergeCalendarAttendees(
      [
        { email: MICHELLE_MAKAREM_EMAIL },
        { email: CANONICAL_XAVIER_EMAIL },
        { email: "Admin@AcceptedAdmissions.org" },
      ],
      [ADMIN, ADMIN, "  admin@acceptedadmissions.org  "],
    ),
    [
      { email: MICHELLE_MAKAREM_EMAIL },
      { email: CANONICAL_XAVIER_EMAIL },
      { email: "Admin@AcceptedAdmissions.org" },
    ],
  );
});

test("create and reschedule keep their existing sendUpdates and still invite admin", async () => {
  const platformSource = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const bookingSource = await readFile(
    fileURLToPath(new URL("./booking.ts", import.meta.url)),
    "utf8",
  );
  const indexSource = await readFile(
    fileURLToPath(new URL("../index.ts", import.meta.url)),
    "utf8",
  );
  assert.equal(platformSource.includes("calendarEventPayload("), false);
  assert.match(
    bookingSource,
    /adminAttendeeEmailsForPair\(parties\?\.student, parties\?\.tutor\)/,
  );
  const createStart = platformSource.indexOf('router.post("/booking/sessions"');
  const cancelStart = platformSource.indexOf('router.post("/booking/sessions/:sessionId/cancel"');
  const createSlice = platformSource.slice(createStart, cancelStart);
  assert.match(createSlice, /neelNikaCalendarEvent\(/);
  assert.match(createSlice, /googleCalendarSendUpdatesForSubjects\(/);
  assert.doesNotMatch(createSlice, /patchGoogleEventAttendees/);
  assert.doesNotMatch(createSlice, /sendUpdates:\s*"none"/);
  const rescheduleStart = platformSource.indexOf(
    'router.post("/booking/sessions/:sessionId/reschedule"',
  );
  const rescheduleEnd = platformSource.indexOf("async function financialSummary");
  const rescheduleSlice = platformSource.slice(rescheduleStart, rescheduleEnd);
  assert.match(rescheduleSlice, /neelNikaCalendarEvent\(/);
  assert.match(
    rescheduleSlice,
    /googleCalendarSendUpdatesForSubjects\(session\.subject, \{\s*tutorEmail: profile\.email,\s*\}\)/,
  );
  assert.match(rescheduleSlice, /inviteAt\(previousStart, session\.timezone\)/);
  assert.doesNotMatch(rescheduleSlice, /patchGoogleEventAttendees/);
  assert.match(
    platformSource,
    /function syncGoogleCalendarForSessionChange[\s\S]*?googleCalendarSendUpdatesForSubjects\(/,
  );
  assert.match(
    platformSource,
    /function neelNikaCalendarEvent[\s\S]*?bookingCalendarEventPayload\(/,
  );
  assert.match(platformSource, /createGoogleEvent\(/);
  assert.match(platformSource, /updateGoogleEvent\(/);
  assert.equal(indexSource.includes("backfillAdminCalendarAttendees"), false);
  assert.equal(indexSource.includes("/admin/calendar-attendees/backfill"), false);
});
