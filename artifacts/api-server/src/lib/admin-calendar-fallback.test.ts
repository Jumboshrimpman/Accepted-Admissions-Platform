import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_CALENDAR_ACCOUNT_EMAIL,
  ADMIN_CALENDAR_FALLBACK_NOTE,
  adminCalendarGrantCanWriteEvents,
  adminCalendarInviteHealth,
  bookingsUseAdminCalendarFallback,
  manualCalendarInviteMessage,
  selectStoredAdminCalendarWriter,
} from "./admin-calendar-fallback.ts";
import { GOOGLE_CALENDAR_APP_CREATED_SCOPE, GOOGLE_CALENDAR_FREEBUSY_SCOPE } from "./google-calendar.ts";

const WRITE_SCOPES = `${GOOGLE_CALENDAR_FREEBUSY_SCOPE} ${GOOGLE_CALENDAR_APP_CREATED_SCOPE}`;

test("admin calendar fallback note is Nika's until her app calendar can take bookings", () => {
  assert.equal(ADMIN_CALENDAR_FALLBACK_NOTE, "Bookings use admin calendar fallback");
  assert.equal(ADMIN_CALENDAR_ACCOUNT_EMAIL, "admin@acceptedadmissions.org");
  assert.equal(
    bookingsUseAdminCalendarFallback({
      name: "Nika Raiffe",
      portalEmail: "other@example.com",
      appCalendarId: null,
    }),
    true,
  );
  assert.equal(
    bookingsUseAdminCalendarFallback({
      name: "Victoria Wijerathnayapa",
      portalEmail: "nika.raiffe@gmail.com",
      appCalendarId: "   ",
    }),
    true,
  );
  assert.equal(
    bookingsUseAdminCalendarFallback({
      name: "Nika Raiffe",
      portalEmail: "nika.raiffe@gmail.com",
      appCalendarId: "cal-nika",
    }),
    false,
  );
  assert.equal(
    bookingsUseAdminCalendarFallback({
      name: "Xavier Morales",
      portalEmail: "xaver.rmz6@gmail.com",
      appCalendarId: null,
    }),
    false,
  );
});

test("a fixed window with no writer asks an admin to send Nika's invite by hand", () => {
  assert.equal(
    manualCalendarInviteMessage({
      bookerName: "Neel Dharni",
      bookerEmail: "neel@example.invalid",
      tutorName: "Nika Raiffe",
      tutorEmail: "other@example.com",
      start: new Date("2026-10-21T22:05:00.000Z"),
      durationMinutes: 60,
    }),
    "Send calendar invite manually: Neel Dharni booked Nika Oct 21, 2026, 6:05 PM ET, 60 minutes. Invite neel@example.invalid, nika.raiffe@gmail.com, admin@acceptedadmissions.org.",
  );
  assert.equal(
    manualCalendarInviteMessage({
      bookerName: "Neel Dharni",
      bookerEmail: "neel@example.invalid",
      tutorName: "Nika Raiffe",
      tutorEmail: "other@example.com",
      start: new Date("2026-10-21T22:05:00.000Z"),
      durationMinutes: 60,
      meetUrl: "https://meet.google.com/rih-iayt-okb",
    }),
    "Send calendar invite manually: Neel Dharni booked Nika Oct 21, 2026, 6:05 PM ET, 60 minutes. Invite neel@example.invalid, nika.raiffe@gmail.com, admin@acceptedadmissions.org. Meet: https://meet.google.com/rih-iayt-okb.",
  );
});

test("a tutor profile authorized as admin@ is never the admin calendar writer", () => {
  const writableTutor = {
    tutorProfileId: "xavier-profile",
    title: "SAT & Math Tutor",
    bookingEligible: true,
    userEmail: "xaver.rmz6@gmail.com",
    portalEmail: "xavier.rmz6@gmail.com",
    googleAccountEmail: "admin@acceptedadmissions.org",
    status: "connected",
    hasRefreshToken: true,
    grantedScopes: WRITE_SCOPES,
    appCalendarId: "xavier-cal",
  };
  const adminAccount = {
    tutorProfileId: "admin-profile",
    title: "Calendar account",
    bookingEligible: false,
    userEmail: " Admin@AcceptedAdmissions.org ",
    portalEmail: ADMIN_CALENDAR_ACCOUNT_EMAIL,
    googleAccountEmail: ADMIN_CALENDAR_ACCOUNT_EMAIL,
    status: "connected",
    hasRefreshToken: true,
    grantedScopes: WRITE_SCOPES,
    appCalendarId: "admin-cal",
  };
  assert.equal(selectStoredAdminCalendarWriter([writableTutor]), null);
  assert.equal(
    selectStoredAdminCalendarWriter([writableTutor, adminAccount])?.tutorProfileId,
    "admin-profile",
  );
  assert.equal(
    selectStoredAdminCalendarWriter([{ ...adminAccount, bookingEligible: true }]),
    null,
  );
  assert.equal(
    selectStoredAdminCalendarWriter([{ ...adminAccount, title: "SAT & Math Tutor" }]),
    null,
  );
});

test("only a connected admin grant with refresh, app calendar, and event-write scope can issue invites", () => {
  const writable = {
    googleAccountEmail: " Admin@AcceptedAdmissions.org ",
    status: "connected",
    hasRefreshToken: true,
    grantedScopes: WRITE_SCOPES,
    appCalendarId: "admin-cal",
  };
  assert.equal(adminCalendarGrantCanWriteEvents(writable), true);
  assert.equal(
    adminCalendarGrantCanWriteEvents({ ...writable, googleAccountEmail: "nika.raiffe@gmail.com" }),
    false,
  );
  assert.equal(
    adminCalendarGrantCanWriteEvents({
      ...writable,
      googleAccountEmail: "tutor@example.com",
      portalEmail: ADMIN_CALENDAR_ACCOUNT_EMAIL,
    }),
    true,
  );
  assert.equal(adminCalendarGrantCanWriteEvents({ ...writable, hasRefreshToken: false }), false);
  assert.equal(adminCalendarGrantCanWriteEvents({ ...writable, status: "disconnected" }), false);
  assert.equal(adminCalendarGrantCanWriteEvents({ ...writable, appCalendarId: "" }), false);
  assert.equal(
    adminCalendarGrantCanWriteEvents({
      ...writable,
      grantedScopes: GOOGLE_CALENDAR_FREEBUSY_SCOPE,
    }),
    false,
  );
  assert.deepEqual(adminCalendarInviteHealth([writable]), {
    healthy: true,
    accountEmail: ADMIN_CALENDAR_ACCOUNT_EMAIL,
    hasRefreshToken: true,
    hasWriteScope: true,
    hasAppCalendar: true,
  });
  assert.deepEqual(
    adminCalendarInviteHealth([
      { ...writable, grantedScopes: GOOGLE_CALENDAR_FREEBUSY_SCOPE, appCalendarId: "" },
    ]),
    {
      healthy: false,
      accountEmail: ADMIN_CALENDAR_ACCOUNT_EMAIL,
      hasRefreshToken: true,
      hasWriteScope: false,
      hasAppCalendar: false,
    },
  );
  assert.equal(adminCalendarInviteHealth([]).healthy, false);
});
