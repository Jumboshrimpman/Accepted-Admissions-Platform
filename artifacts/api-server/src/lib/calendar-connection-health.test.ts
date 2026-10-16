import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  buildCalendarConnectionHealth,
  calendarConnectionTestAdmission,
  calendarConnectionTestRetryMessage,
  calendarHealthBadge,
  calendarReconnectAlerts,
  compareTutorConnectionOrder,
  errorPointsToTestingMode,
  estimatedTokenAgeDays,
  hasUpcomingBookableTime,
  maskSensitiveCalendarValue,
  preserveRevokedCalendarTestReason,
  readTutorBusyWindows,
  safeCalendarErrorMessage,
  shouldWriteCalendarFreeBusySuccess,
  TESTING_MODE_EXPIRY_WARNING,
  testingModeExpiryWarning,
  UNKNOWN_GOOGLE_ACCOUNT_LABEL,
} from "./calendar-connection-health.ts";

const weekdayHours = { "1": [{ start: "07:00", end: "21:00" }] };

test("badges distinguish a live grant, a lost grant, and no connection", () => {
  assert.equal(calendarHealthBadge({ hasRefreshToken: true, connectedAt: null }), "healthy");
  assert.equal(
    calendarHealthBadge({
      hasRefreshToken: false,
      connectedAt: "2026-10-01T00:00:00.000Z",
      lastError: null,
    }),
    "needs_reconnect",
  );
  assert.equal(
    calendarHealthBadge({
      hasRefreshToken: false,
      connectedAt: null,
      lastError: "Google revoked the calendar grant. Reconnect is required.",
    }),
    "needs_reconnect",
  );
  assert.equal(
    calendarHealthBadge({ hasRefreshToken: false, connectedAt: null, lastError: null }),
    "not_connected",
  );
  assert.equal(
    calendarHealthBadge({
      hasRefreshToken: true,
      lastError: "The free/busy check failed.",
    }),
    "needs_attention",
  );
  assert.equal(
    calendarHealthBadge({ hasRefreshToken: true, lastError: "   " }),
    "healthy",
  );
});

test("a failed test keeps a revoked message and spaces calls 45 seconds apart", () => {
  const revoked = "Google revoked the calendar grant. Reconnect is required.";
  assert.equal(preserveRevokedCalendarTestReason(revoked, "not_connected"), revoked);
  assert.equal(preserveRevokedCalendarTestReason(revoked, "calendar_check_failed"), revoked);
  assert.equal(
    preserveRevokedCalendarTestReason("invalid_grant", "CALENDAR_DISCONNECTED"),
    "invalid_grant",
  );
  assert.equal(preserveRevokedCalendarTestReason(null, "not_connected"), "not_connected");
  assert.equal(
    preserveRevokedCalendarTestReason("The free/busy check failed.", "CALENDAR_UNAVAILABLE"),
    "CALENDAR_UNAVAILABLE",
  );

  const now = 1_000_000;
  const tutorProfileId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(
    calendarConnectionTestAdmission({ tutorProfileId, now, inFlight: false }),
    { allowed: true },
  );
  assert.deepEqual(
    calendarConnectionTestAdmission({
      tutorProfileId,
      now,
      lastStartedAt: now - 10_000,
      inFlight: false,
    }),
    { allowed: false, retryAfterSeconds: 35 },
  );
  assert.deepEqual(
    calendarConnectionTestAdmission({
      tutorProfileId,
      now: now + 45_000,
      lastStartedAt: now,
      inFlight: false,
    }),
    { allowed: true },
  );
  assert.deepEqual(
    calendarConnectionTestAdmission({ tutorProfileId, now, inFlight: true }),
    { allowed: false, retryAfterSeconds: 45 },
  );
  assert.deepEqual(
    calendarConnectionTestAdmission({
      tutorProfileId: "22222222-2222-4222-8222-222222222222",
      now,
      lastStartedAt: now,
      inFlight: false,
    }),
    { allowed: false, retryAfterSeconds: 45 },
  );
});

function stubBookingError(status: number, code: string, message: string): Error {
  const error = new Error(message);
  Object.assign(error, { status, code });
  return error;
}

async function flushBackground(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

test("a throwing health write does not change slotsForTutor's result or error", async () => {
  const tutorProfileId = "11111111-1111-4111-8111-111111111111";
  const windows = [{ start: "2026-10-16T15:00:00.000Z", end: "2026-10-16T16:00:00.000Z" }];
  const warnings: Array<{ fields: unknown; message: string }> = [];
  const warn = (
    fields: { event: "calendar.health_write_failed"; tutorProfileId: string },
    message: string,
  ) => {
    warnings.push({ fields, message });
  };

  let rejectWrite: (error: Error) => void = () => {};
  const success = await readTutorBusyWindows({
    tutorProfileId,
    connection: { lastFreeBusyAt: null, lastError: null },
    listBusy: async () => windows,
    record: () =>
      new Promise<void>((_, reject) => {
        rejectWrite = reject;
      }),
    warn,
  });
  assert.deepEqual(success, { disconnected: false, busyWindows: windows });
  await flushBackground();
  rejectWrite(new Error("pool timeout ya29.secret-body"));
  await flushBackground();
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0]?.fields, {
    event: "calendar.health_write_failed",
    tutorProfileId,
  });
  assert.equal(warnings[0]?.message, "health write failed");
  assert.equal(/ya29|pool timeout|secret-body/.test(JSON.stringify(warnings)), false);

  warnings.length = 0;
  const unavailable = stubBookingError(
    503,
    "CALENDAR_UNAVAILABLE",
    "Google Calendar is temporarily unavailable.",
  );
  let rejectFailureWrite: (error: Error) => void = () => {};
  await assert.rejects(
    () =>
      readTutorBusyWindows({
        tutorProfileId,
        connection: { lastFreeBusyAt: null, lastError: null },
        listBusy: async () => {
          throw unavailable;
        },
        record: () =>
          new Promise<void>((_, reject) => {
            rejectFailureWrite = reject;
          }),
        warn,
      }),
    (error) => error === unavailable,
  );
  await flushBackground();
  rejectFailureWrite(new Error("lock timeout ya29.other"));
  await flushBackground();
  assert.equal(warnings.length, 1);
  assert.equal(/ya29|lock timeout/.test(JSON.stringify(warnings)), false);

  const disconnected = stubBookingError(
    409,
    "CALENDAR_DISCONNECTED",
    "The tutor's calendar is disconnected.",
  );
  const fallback = await readTutorBusyWindows({
    tutorProfileId,
    connection: { lastFreeBusyAt: null, lastError: "previous" },
    listBusy: async () => {
      throw disconnected;
    },
    record: async () => {
      throw new Error("db blip ya29.disconnected");
    },
    warn,
  });
  assert.deepEqual(fallback, { disconnected: true });
  await flushBackground();
  assert.equal(/ya29|db blip/.test(JSON.stringify(warnings)), false);

  let wrote = false;
  const freshAt = new Date(Date.now() - 10_000).toISOString();
  const skipped = await readTutorBusyWindows({
    tutorProfileId,
    connection: { lastFreeBusyAt: freshAt, lastError: "  " },
    listBusy: async () => windows,
    record: async () => {
      wrote = true;
    },
    warn,
  });
  assert.equal(skipped.disconnected, false);
  if (!skipped.disconnected) assert.deepEqual(skipped.busyWindows, windows);
  await flushBackground();
  assert.equal(wrote, false);
  assert.equal(
    shouldWriteCalendarFreeBusySuccess({
      lastFreeBusyAt: new Date(Date.now() - 61_000),
      lastError: null,
      now: Date.now(),
    }),
    true,
  );
  assert.equal(
    shouldWriteCalendarFreeBusySuccess({
      lastFreeBusyAt: freshAt,
      lastError: "The free/busy check failed.",
      now: Date.now(),
    }),
    true,
  );
});

test("masks Google account and calendar ids and drops token-like errors", () => {
  assert.equal(maskSensitiveCalendarValue("eunice_chon@berkeley.edu"), "e***@berkeley.edu");
  assert.equal(maskSensitiveCalendarValue("primary"), "primary");
  assert.equal(maskSensitiveCalendarValue("abcdef123456"), "ab…56");
  assert.equal(maskSensitiveCalendarValue("  "), null);
  assert.equal(
    safeCalendarErrorMessage("invalid_grant"),
    "Google revoked the calendar grant. Reconnect is required.",
  );
  assert.equal(safeCalendarErrorMessage("Bearer ya29.secret-token"), "Calendar check failed.");
  assert.equal(safeCalendarErrorMessage("refresh_token=secret"), "Calendar check failed.");
});

test("Eunice uses the same health rules as Xavier and only alerts when she still has bookable hours", () => {
  const eunice = buildCalendarConnectionHealth({
    tutorProfileId: "eunice-profile",
    name: "Eunice Chon",
    portalEmail: "eunice_chon@berkeley.edu",
    active: true,
    bookingEligible: true,
    weeklyHours: weekdayHours,
    hasRefreshToken: false,
    connectedAt: "2026-09-01T00:00:00.000Z",
    googleAccountEmail: "eunice_chon@berkeley.edu",
    calendarId: "primary",
    lastError: "Google revoked the calendar grant. Reconnect is required.",
  });
  const xavier = buildCalendarConnectionHealth({
    tutorProfileId: "xavier-profile",
    name: "Xavier Morales",
    portalEmail: "xaver.rmz6@gmail.com",
    active: true,
    bookingEligible: true,
    weeklyHours: weekdayHours,
    hasRefreshToken: true,
    googleAccountEmail: "xaver.rmz6@gmail.com",
    calendarId: "primary",
  });
  assert.equal(eunice.badge, "needs_reconnect");
  assert.equal(eunice.googleAccountMasked, "e***@berkeley.edu");
  assert.equal(eunice.hasUpcomingBookableTime, true);
  assert.equal(xavier.badge, "healthy");
  assert.equal(xavier.connectionStatus, "connected");
  const recentFailure = buildCalendarConnectionHealth({
    tutorProfileId: "nika-profile",
    name: "Nika Raiffe",
    portalEmail: "nika.raiffe@gmail.com",
    active: true,
    bookingEligible: true,
    weeklyHours: weekdayHours,
    hasRefreshToken: true,
    calendarId: "primary",
    connectedAt: "2026-09-01T00:00:00.000Z",
    lastError: "The free/busy check failed.",
    lastErrorAt: "2026-10-15T00:00:00.000Z",
  });
  assert.equal(recentFailure.badge, "needs_attention");
  assert.equal(recentFailure.lastError, "The free/busy check failed.");
  assert.equal(recentFailure.googleAccountMasked, UNKNOWN_GOOGLE_ACCOUNT_LABEL);
  assert.equal(calendarReconnectAlerts([recentFailure]).length, 0);
  const neverConnected = buildCalendarConnectionHealth({
    tutorProfileId: "new-profile",
    name: "Aurelia Finch",
    portalEmail: "aurelia@example.com",
    hasRefreshToken: false,
    connectionStatus: "disconnected",
    lastError: "The free/busy check failed.",
  });
  assert.equal(neverConnected.badge, "not_connected");
  assert.equal(neverConnected.googleAccountMasked, null);
  assert.deepEqual(
    calendarReconnectAlerts([eunice, xavier]).map((row) => row.name),
    ["Eunice Chon"],
  );

  const paused = buildCalendarConnectionHealth({
    ...{
      tutorProfileId: "eunice-profile",
      name: "Eunice Chon",
      portalEmail: "eunice_chon@berkeley.edu",
      active: true,
      bookingEligible: false,
      weeklyHours: weekdayHours,
      hasRefreshToken: false,
      connectedAt: "2026-09-01T00:00:00.000Z",
    },
  });
  assert.equal(paused.bookable, false);
  assert.equal(paused.hasUpcomingBookableTime, false);
  assert.equal(calendarReconnectAlerts([paused]).length, 0);
  assert.equal(hasUpcomingBookableTime({ active: true, bookingEligible: true, weeklyHours: {} }), false);
});

test("featured tutors sort ahead of other profiles", () => {
  const names = ["Aurelia Finch", "Nika Raiffe", "Eunice Chon", "Xavier Morales", "Victoria Wijerathnayapa"];
  assert.deepEqual(
    names.slice().sort(compareTutorConnectionOrder),
    ["Xavier Morales", "Victoria Wijerathnayapa", "Eunice Chon", "Nika Raiffe", "Aurelia Finch"],
  );
});

test("the public health row never carries token fields", () => {
  const row = buildCalendarConnectionHealth({
    tutorProfileId: "nika",
    name: "Nika Raiffe",
    portalEmail: "nika.raiffe@gmail.com",
    active: true,
    bookingEligible: true,
    weeklyHours: weekdayHours,
    hasRefreshToken: true,
    googleAccountEmail: "nika.raiffe@gmail.com",
  });
  const serialized = JSON.stringify(row);
  assert.equal(typeof row.hasRefreshToken, "boolean");
  assert.equal(/encrypted|accessToken|ya29|refresh_token|bearer/i.test(serialized), false);
  assert.equal(row.googleAccountMasked, "n***@gmail.com");
  const leaked = buildCalendarConnectionHealth({
    tutorProfileId: "nika",
    name: "Nika Raiffe",
    portalEmail: "nika.raiffe@gmail.com",
    hasRefreshToken: false,
    lastError: "Bearer ya29.secret-token",
  });
  assert.equal(leaked.lastError, "Calendar check failed.");
  assert.equal(/ya29/.test(JSON.stringify(leaked)), false);
});

test("admin connections stay read-only and Eunice is not on a separate calendar path", async () => {
  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const persistence = await readFile(
    fileURLToPath(new URL("./calendar-persistence.ts", import.meta.url)),
    "utf8",
  );
  const store = await readFile(
    fileURLToPath(new URL("./calendar-connection-health-store.ts", import.meta.url)),
    "utf8",
  );
  const tutorDashboard = await readFile(
    fileURLToPath(new URL("../../../accepted-admissions/src/pages/tutor/dashboard.tsx", import.meta.url)),
    "utf8",
  );
  const adminConnections = platform.slice(platform.indexOf('"/admin/calendar-connections"'));
  const testRoute = platform.slice(
    platform.indexOf('"/admin/calendar-connections/:tutorProfileId/test"'),
  );
  const googleCall = testRoute.indexOf("listGoogleBusyWindows");
  const beforeGoogle = testRoute.slice(0, googleCall);
  const slotsStart = platform.indexOf("async function slotsForTutor");
  const slotsSlice = platform.slice(
    slotsStart,
    platform.indexOf("async function studentCollegeConsultingCourse"),
  );
  const refreshStart = persistence.indexOf("export async function saveRefreshedGoogleAccessToken");
  const refreshSlice = persistence.slice(
    refreshStart,
    persistence.indexOf("export async function markGoogleCalendarConnected"),
  );
  assert.match(platform, /\/admin\/calendar-connections"/);
  assert.match(platform, /\/admin\/calendar-connections\/:tutorProfileId\/test"/);
  assert.match(adminConnections, /listGoogleBusyWindows/);
  assert.equal(/createGoogleEvent|resend|sendEmail|sendInvite/.test(adminConnections), false);
  assert.ok(beforeGoogle.indexOf("status(429)") !== -1);
  assert.match(beforeGoogle, /retryAfterSeconds/);
  assert.match(beforeGoogle, /calendarConnectionTestRetryMessage/);
  assert.equal(calendarConnectionTestRetryMessage(35), "Wait 35 seconds before testing this calendar again.");
  assert.ok(
    beforeGoogle.indexOf("status(429)") <
      beforeGoogle.indexOf("calendarConnectionTestStartedAt.set"),
  );
  assert.ok(
    beforeGoogle.indexOf("calendarConnectionTestStartedAt.set") <
      beforeGoogle.indexOf("calendarConnectionTestInFlight.add"),
  );
  assert.match(beforeGoogle, /calendarConnectionTestInFlight\.add/);
  assert.match(testRoute, /preserveRevokedCalendarTestReason/);
  assert.match(slotsSlice, /readTutorBusyWindows\(/);
  assert.equal(/await\s+recordCalendarFreeBusyCheck/.test(slotsSlice), false);
  assert.match(slotsSlice, /listed\.disconnected/);
  const healthSource = await readFile(
    fileURLToPath(new URL("./calendar-connection-health.ts", import.meta.url)),
    "utf8",
  );
  const writer = healthSource.slice(
    healthSource.indexOf("export function recordCalendarFreeBusyInBackground"),
    healthSource.indexOf("function bookingFailureCode"),
  );
  assert.match(writer, /calendar\.health_write_failed/);
  assert.match(writer, /health write failed/);
  assert.match(writer, /\.catch\(\(\) =>/);
  assert.equal(/catch\(\s*\((?:error|err|reason)\b/.test(writer), false);
  assert.match(refreshSlice, /lastError: null/);
  assert.match(refreshSlice, /lastErrorAt: null/);
  assert.match(persistence, /reconnectStoredGoogleCalendarGrants/);
  assert.equal(persistence.includes("Eunice"), false);
  assert.equal(persistence.includes("Xavier"), false);
  assert.equal(/bookingEligible:\s*(true|false)/.test(store), false);
  assert.match(tutorDashboard, /<CalendarConnectionCard/);
  assert.equal(tutorDashboard.includes("Eunice"), false);
});

const revoked = "Google revoked the calendar grant. Reconnect is required.";

test("a 6-day invalid_grant warns about the 7-day Testing-mode expiry for every tutor", () => {
  const now = new Date("2026-10-16T10:39:00.000Z");
  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const almostSixDays = new Date(sixDaysAgo.getTime() + 60_000);
  assert.equal(errorPointsToTestingMode("invalid_grant"), true);
  assert.equal(errorPointsToTestingMode("Token has been expired or revoked."), true);
  assert.equal(errorPointsToTestingMode(revoked), true);
  assert.equal(errorPointsToTestingMode("The free/busy check failed."), false);
  assert.equal(errorPointsToTestingMode("The tutor disconnected Google Calendar."), false);
  assert.equal(
    testingModeExpiryWarning({
      connectedAt: almostSixDays,
      lastError: "invalid_grant",
      now,
    }),
    null,
  );
  assert.equal(estimatedTokenAgeDays(almostSixDays, now), 5);
  assert.match(
    testingModeExpiryWarning({
      connectedAt: sixDaysAgo,
      lastError: "invalid_grant",
      now,
    }) ?? "",
    /Testing mode/,
  );
  assert.match(TESTING_MODE_EXPIRY_WARNING, /7 days/);
  for (const name of ["Xavier Morales", "Eunice Chon", "Nika Raiffe", "Victoria Wijerathnayapa"]) {
    const row = buildCalendarConnectionHealth({
      tutorProfileId: name,
      name,
      portalEmail: "tutor@example.com",
      active: true,
      bookingEligible: true,
      weeklyHours: weekdayHours,
      hasRefreshToken: false,
      connectedAt: sixDaysAgo,
      lastTokenRefreshAt: new Date("2026-10-16T10:39:00.000Z"),
      lastError: revoked,
      lastErrorAt: now,
      now,
    });
    assert.equal(row.badge, "needs_reconnect");
    assert.equal(row.connectionStatus, "disconnected");
    assert.equal(row.estimatedTokenAgeDays, 6);
    assert.equal(row.lastTokenRefreshAt, "2026-10-16T10:39:00.000Z");
    assert.equal(row.lastError, revoked);
    assert.match(row.testingModeExpiryWarning ?? "", /7 days/);
  }
  const young = buildCalendarConnectionHealth({
    tutorProfileId: "xavier",
    name: "Xavier Morales",
    portalEmail: "xaver.rmz6@gmail.com",
    hasRefreshToken: false,
    connectedAt: almostSixDays,
    lastError: "invalid_grant",
    now,
  });
  assert.equal(young.testingModeExpiryWarning, null);
  assert.equal(young.estimatedTokenAgeDays, 5);
  const transient = buildCalendarConnectionHealth({
    tutorProfileId: "nika",
    name: "Nika Raiffe",
    portalEmail: "nika.raiffe@gmail.com",
    hasRefreshToken: true,
    connectedAt: sixDaysAgo,
    lastError: "The free/busy check failed.",
    now,
  });
  assert.equal(transient.badge, "needs_attention");
  assert.equal(transient.testingModeExpiryWarning, null);
  assert.deepEqual(
    calendarReconnectAlerts([
      buildCalendarConnectionHealth({
        tutorProfileId: "eunice",
        name: "Eunice Chon",
        portalEmail: "eunice_chon@berkeley.edu",
        active: true,
        bookingEligible: true,
        weeklyHours: weekdayHours,
        hasRefreshToken: false,
        connectedAt: sixDaysAgo,
        lastError: revoked,
        now,
      }),
    ]).map((row) => row.testingModeExpiryWarning),
    [TESTING_MODE_EXPIRY_WARNING],
  );
});

test("admin reconnect links are signed, single-use, and still reject a mismatched Google account", async () => {
  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const connections = await readFile(
    fileURLToPath(new URL("../../../accepted-admissions/src/pages/admin/connections.tsx", import.meta.url)),
    "utf8",
  );
  const store = await readFile(
    fileURLToPath(new URL("./calendar-oauth-nonce-store.ts", import.meta.url)),
    "utf8",
  );
  const callback = platform.slice(
    platform.indexOf('"/calendar/oauth/callback"'),
    platform.indexOf('"/calendar/connections"'),
  );
  const reconnect = platform.slice(
    platform.indexOf('"/admin/calendar-connections/:tutorProfileId/reconnect-link"'),
    platform.indexOf('"/admin/overview"'),
  );
  const consumeAt = callback.indexOf("consumeCalendarOAuthNonce");
  const mismatchAt = callback.indexOf("email_mismatch");
  assert.ok(consumeAt > 0);
  assert.ok(mismatchAt > consumeAt);
  assert.match(callback, /purpose === "admin_reconnect"/);
  assert.match(callback, /googleAccountMatchesPortalEmails/);
  assert.match(callback, /calendarGoogleAccountMismatchMessage\(/);
  assert.match(callback, /stateData\.purpose/);
  const google = await readFile(
    fileURLToPath(new URL("./google-calendar.ts", import.meta.url)),
    "utf8",
  );
  assert.match(google, /Ask an admin for a new reconnect link/);
  assert.match(google, /timingSafeEqual\(received, expected\)/);
  assert.match(reconnect, /ensureRole\(\["administrator"\]\)/);
  assert.match(reconnect, /purpose:\s*"admin_reconnect"/);
  assert.match(reconnect, /persistCalendarOAuthNonce/);
  assert.match(reconnect, /profile\.userId/);
  assert.doesNotMatch(reconnect, /sendEmail|mailto:|resend|nodemailer/);
  assert.match(connections, /copy-reconnect-link-/);
  assert.match(connections, /Text this link to the tutor/);
  assert.doesNotMatch(connections, /mailto:/);
  assert.match(store, /usedAt: now/);
  assert.match(store, /isNull\(calendarOauthNoncesTable\.usedAt\)/);
  assert.match(store, /calendarOauthNoncesTable\.tutorProfileId/);
});
