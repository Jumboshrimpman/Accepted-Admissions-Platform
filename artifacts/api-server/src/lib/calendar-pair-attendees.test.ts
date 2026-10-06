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
  adminAttendeeEmailsForPair,
  CALENDAR_PAIR_ADMIN_INVITES,
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

test("admin calendar guests are configured only for Michelle with Xavier", () => {
  assert.equal(CALENDAR_PAIR_ADMIN_INVITES.length, 1);
  assert.deepEqual(CALENDAR_PAIR_ADMIN_INVITES[0], {
    studentClerkUserIds: ["user_3JCRGfBj8dgWSjO1r2zeKovFVE7"],
    studentEmails: ["makaremmichelle7@gmail.com"],
    tutorClerkUserIds: ["user_3IxUfoT1xRnDsqhlx5NN1eGfRg6"],
    tutorEmails: ["xaver.rmz6@gmail.com"],
    adminEmails: [ADMIN_INBOX_EMAIL],
  });
  assert.equal(ADMIN_INBOX_EMAIL, ADMIN);
  assert.deepEqual(adminAttendeeEmailsForPair(michelle, xavier), [ADMIN]);
  assert.deepEqual(adminAttendeeEmailsForPair(null, xavier), []);
  assert.deepEqual(adminAttendeeEmailsForPair(michelle, null), []);
});

test("Michelle and Xavier match by Clerk id or email, not by display name", () => {
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID, email: "renamed@example.com" },
      { clerkUserId: CANONICAL_XAVIER_CLERK_USER_ID, email: "also-renamed@example.com" },
    ),
    [ADMIN],
  );
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { email: "  MakaremMichelle7@gmail.com " },
      { email: "Xaver.Rmz6@gmail.com" },
    ),
    [ADMIN],
  );
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID },
      { email: CANONICAL_XAVIER_EMAIL },
    ),
    [ADMIN],
  );
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { clerkUserId: "user_other", email: "Xavier Morales" },
      { clerkUserId: "user_other_tutor", email: "Michelle Makarem" },
    ),
    [],
  );
});

test("unrelated student and tutor pairs do not invite admin", () => {
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { clerkUserId: "user_taito", email: "taito0525@gmail.com" },
      xavier,
    ),
    [],
  );
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      michelle,
      { clerkUserId: "user_eunice", email: "eunice_chon@berkeley.edu" },
    ),
    [],
  );
  assert.deepEqual(
    adminAttendeeEmailsForPair(
      { clerkUserId: "user_student", email: "student@example.com" },
      { clerkUserId: "user_tutor", email: "tutor@example.com" },
    ),
    [],
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

test("other bookings keep only their own attendee and the same event fields", () => {
  const event = invite("taito0525@gmail.com", {
    clerkUserId: "user_taito",
    email: "taito0525@gmail.com",
  }, {
    clerkUserId: "user_eunice",
    email: "eunice_chon@berkeley.edu",
  });
  assert.equal(event.location, MEET_URL);
  assert.deepEqual(event.attendees, [{ email: "taito0525@gmail.com" }]);
  assert.equal(
    event.attendees.some((attendee) => attendee.email === ADMIN),
    false,
  );

  const unchanged = calendarEventPayload(
    "SAT session",
    START,
    60,
    "America/New_York",
    "michelle@example.com",
    MEET_URL,
  );
  assert.deepEqual(unchanged.attendees, [{ email: "michelle@example.com" }]);
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

test("create, reschedule, and admin calendar updates all use the pair invite", async () => {
  const platformSource = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const bookingSource = await readFile(
    fileURLToPath(new URL("./booking.ts", import.meta.url)),
    "utf8",
  );
  assert.equal(platformSource.includes("calendarEventPayload("), false);
  assert.match(
    bookingSource,
    /adminAttendeeEmailsForPair\(parties\?\.student, parties\?\.tutor\)/,
  );
  assert.match(
    platformSource,
    /function syncGoogleCalendarForSessionChange[\s\S]*?bookingCalendarEventPayload\(/,
  );
  assert.match(
    platformSource,
    /router\.post\("\/booking\/sessions", async[\s\S]*?bookingCalendarEventPayload\(/,
  );
  assert.match(
    platformSource,
    /router\.post\("\/booking\/sessions\/:sessionId\/reschedule"[\s\S]*?bookingCalendarEventPayload\(/,
  );
  assert.match(platformSource, /inviteAt\(previousStart, session\.timezone\)/);
  assert.match(
    platformSource,
    /createGoogleEvent\([\s\S]*?bookingCalendarEventPayload\(/,
  );
  assert.match(
    platformSource,
    /updateGoogleEvent\([\s\S]*?bookingCalendarEventPayload\(/,
  );
});
