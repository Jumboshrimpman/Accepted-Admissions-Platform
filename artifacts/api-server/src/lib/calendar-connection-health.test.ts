import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  buildCalendarConnectionHealth,
  calendarHealthBadge,
  calendarReconnectAlerts,
  compareTutorConnectionOrder,
  hasUpcomingBookableTime,
  maskSensitiveCalendarValue,
  safeCalendarErrorMessage,
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
  assert.match(platform, /\/admin\/calendar-connections"/);
  assert.match(platform, /\/admin\/calendar-connections\/:tutorProfileId\/test"/);
  assert.match(adminConnections, /listGoogleBusyWindows/);
  assert.equal(/createGoogleEvent|resend|sendEmail|sendInvite/.test(adminConnections), false);
  assert.match(persistence, /reconnectStoredGoogleCalendarGrants/);
  assert.equal(persistence.includes("Eunice"), false);
  assert.equal(persistence.includes("Xavier"), false);
  assert.equal(/bookingEligible:\s*(true|false)/.test(store), false);
  assert.match(tutorDashboard, /<CalendarConnectionCard/);
  assert.equal(tutorDashboard.includes("Eunice"), false);
});
