import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  ADMIN_ATTENDEE_BACKFILL_GUARD_MS,
  attendeesIncludingAdmin,
  backfillAdminCalendarAttendees,
  eventWithinAdminBackfillGuard,
  type AdminAttendeeBackfillSession,
} from "./calendar-admin-attendee.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { patchGoogleEventAttendees } from "./google-calendar.ts";

const NOW = new Date("2026-10-16T14:00:00.000Z");
const ADMIN = "admin@acceptedadmissions.org";

function session(id: string, start: Date): AdminAttendeeBackfillSession {
  return {
    sessionId: id,
    title: `${id} session`,
    start,
    tutorUserId: "tutor-user",
    providerEventId: `evt-${id}`,
  };
}

test("the 60-minute guard refuses imminent events and allows later ones", () => {
  assert.equal(ADMIN_ATTENDEE_BACKFILL_GUARD_MS, 60 * 60 * 1000);
  assert.equal(
    eventWithinAdminBackfillGuard(new Date(NOW.getTime() + 60 * 60 * 1000), NOW),
    true,
  );
  assert.equal(
    eventWithinAdminBackfillGuard(new Date(NOW.getTime() + 30 * 60 * 1000), NOW),
    true,
  );
  assert.equal(
    eventWithinAdminBackfillGuard(new Date(NOW.getTime() + 60 * 60 * 1000 + 1), NOW),
    false,
  );
});

test("dry run lists events missing admin@ and does not patch, including the 60-minute refusal", async () => {
  const soon = session("soon", new Date(NOW.getTime() + 30 * 60 * 1000));
  const later = session("later", new Date(NOW.getTime() + 2 * 60 * 60 * 1000));
  const present = session("present", new Date(NOW.getTime() + 3 * 60 * 60 * 1000));
  const patches: Array<{ id: string; sendUpdates: string; attendees: { email: string }[] }> = [];
  const report = await backfillAdminCalendarAttendees({
    dryRun: true,
    now: NOW,
    sessions: [soon, later, present],
    readAttendees: async (row) =>
      row.sessionId === "present"
        ? [{ email: "student@example.com" }, { email: ADMIN }]
        : [{ email: "student@example.com" }],
    patchAttendees: async (row, attendees, sendUpdates) => {
      patches.push({ id: row.sessionId, sendUpdates, attendees: [...attendees] });
    },
  });
  assert.equal(report.dryRun, true);
  assert.deepEqual(patches, []);
  assert.deepEqual(report.patched, []);
  assert.equal(report.alreadyPresent, 1);
  assert.deepEqual(
    report.missing.map((row) => row.sessionId),
    ["later"],
  );
  assert.deepEqual(report.refused, [
    {
      sessionId: "soon",
      title: "soon session",
      start: soon.start.toISOString(),
      reason: "starts_within_60_minutes",
    },
  ]);
});

test("backfill patches only later events and passes sendUpdates none", async () => {
  const soon = session("soon", new Date(NOW.getTime() + 59 * 60 * 1000));
  const later = session("later", new Date(NOW.getTime() + 61 * 60 * 1000));
  const patches: Array<{ id: string; sendUpdates: string; attendees: { email: string }[] }> = [];
  const report = await backfillAdminCalendarAttendees({
    dryRun: false,
    now: NOW,
    sessions: [soon, later],
    readAttendees: async () => [{ email: "student@example.com" }, { email: "Tutor@Example.com" }],
    patchAttendees: async (row, attendees, sendUpdates) => {
      patches.push({ id: row.sessionId, sendUpdates, attendees: [...attendees] });
    },
  });
  assert.deepEqual(report.patched, ["later"]);
  assert.deepEqual(report.refused.map((row) => row.sessionId), ["soon"]);
  assert.equal(patches.length, 1);
  assert.equal(patches[0]?.sendUpdates, "none");
  assert.deepEqual(patches[0]?.attendees, [
    { email: "student@example.com" },
    { email: "Tutor@Example.com" },
    { email: ADMIN },
  ]);
  assert.deepEqual(
    attendeesIncludingAdmin([{ email: ADMIN }, { email: "student@example.com" }]),
    [{ email: ADMIN }, { email: "student@example.com" }],
  );
});

test("the attendee patch path uses sendUpdates=none", async () => {
  const urls: string[] = [];
  const methods: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    urls.push(String(input));
    methods.push(init?.method ?? "GET");
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: "evt-1", attendees: body.attendees }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await patchGoogleEventAttendees(
      "token",
      "primary",
      "evt-1",
      [
        { email: "student@example.com" },
        { email: ADMIN },
      ],
      "none",
    );
  } finally {
    globalThis.fetch = previous;
  }
  assert.deepEqual(methods, ["PATCH"]);
  assert.equal(urls.length, 1);
  assert.match(urls[0] ?? "", /\/calendar\/v3\/calendars\/primary\/events\/evt-1\?sendUpdates=none$/);
  assert.equal((urls[0] ?? "").includes("sendUpdates=all"), false);
});

test("admin backfill is an explicit route and does not run at boot", async () => {
  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const indexSource = await readFile(
    fileURLToPath(new URL("../index.ts", import.meta.url)),
    "utf8",
  );
  const google = await readFile(
    fileURLToPath(new URL("./google-calendar.ts", import.meta.url)),
    "utf8",
  );
  const backfill = await readFile(
    fileURLToPath(new URL("./calendar-admin-attendee.ts", import.meta.url)),
    "utf8",
  );
  const routeStart = platform.indexOf('"/admin/calendar-attendees/backfill"');
  const routeEnd = platform.indexOf("const CALENDAR_CONNECTION_TEST_WINDOW_MS");
  const route = platform.slice(routeStart, routeEnd);
  assert.ok(routeStart > 0);
  assert.match(route, /ensureRole\(\["administrator"\]\)/);
  assert.match(route, /dryRun/);
  assert.match(route, /patchGoogleEventAttendees\(/);
  assert.match(route, /sendUpdates/);
  assert.match(backfill, /patchAttendees\(session, nextAttendees, "none"\)/);
  assert.match(google, /export async function patchGoogleEventAttendees/);
  assert.match(google, /sendUpdates: "none"/);
  assert.equal(indexSource.includes("backfillAdminCalendarAttendees"), false);
  assert.equal(indexSource.includes("calendar-attendees/backfill"), false);
  assert.match(indexSource, /Stored Google Calendar refresh tokens kept connected/);
});
