import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  ACCEPTED_ADMISSIONS_CALENDAR_SUMMARY,
  availabilityCalendarIds,
  calendarGrantNeedsReconnect,
  ensureAcceptedAdmissionsCalendar,
  runStoredCalendarWrite,
  sessionEventCalendarId,
} from "./app-created-calendar.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  GOOGLE_CALENDAR_SCOPES,
  GoogleCalendarRequestError,
  listGoogleBusyWindows,
} from "./google-calendar.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  buildCalendarConnectionHealth,
  calendarHealthBadge,
} from "./calendar-connection-health.ts";

const REQUESTED_SCOPES = [
  "openid",
  "email",
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
];

test("OAuth requests openid, email, freebusy, and calendar.app.created", () => {
  assert.deepEqual([...GOOGLE_CALENDAR_SCOPES], REQUESTED_SCOPES);
  assert.equal(
    GOOGLE_CALENDAR_SCOPES.includes("https://www.googleapis.com/auth/calendar.events"),
    false,
  );
  assert.equal(JSON.stringify(GOOGLE_CALENDAR_SCOPES).includes("calendar.events.freebusy"), false);
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<void>,
) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = previous;
  }
}

test("creates Accepted Admissions Sessions when no secondary calendar is stored", async () => {
  const calls: string[] = [];
  await withFetch(async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    assert.equal(init?.method, "POST");
    assert.match(url, /\/calendar\/v3\/calendars$/);
    const body = JSON.parse(String(init?.body)) as { summary?: string };
    assert.equal(body.summary, ACCEPTED_ADMISSIONS_CALENDAR_SUMMARY);
    return jsonResponse(200, { id: "cal-new", summary: body.summary });
  }, async () => {
    assert.equal(await ensureAcceptedAdmissionsCalendar("token", null), "cal-new");
    assert.equal(await ensureAcceptedAdmissionsCalendar("token", "primary"), "cal-new");
  });
  assert.deepEqual(calls, [
    "POST https://www.googleapis.com/calendar/v3/calendars",
    "POST https://www.googleapis.com/calendar/v3/calendars",
  ]);
});

test("reuses a stored secondary calendar and replaces it only after 404", async () => {
  const calls: string[] = [];
  await withFetch(async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (init?.method === "GET") return jsonResponse(200, { id: "cal-existing" });
    return jsonResponse(200, { id: "should-not-create" });
  }, async () => {
    assert.equal(await ensureAcceptedAdmissionsCalendar("token", "cal-existing"), "cal-existing");
  });
  assert.deepEqual(calls, ["/calendar/v3/calendars/cal-existing"].map((path) => `GET ${path}`));

  calls.length = 0;
  await withFetch(async (input, init) => {
    calls.push(init?.method ?? "GET");
    if (init?.method === "GET") return jsonResponse(404, { error: { code: 404, message: "Not Found" } });
    const body = JSON.parse(String(init?.body)) as { summary?: string };
    assert.equal(body.summary, ACCEPTED_ADMISSIONS_CALENDAR_SUMMARY);
    return jsonResponse(200, { id: "cal-replaced" });
  }, async () => {
    assert.equal(await ensureAcceptedAdmissionsCalendar("token", "cal-gone"), "cal-replaced");
  });
  assert.deepEqual(calls, ["GET", "POST"]);
});

test("a 403 while reading the stored calendar does not create a duplicate", async () => {
  const calls: string[] = [];
  await withFetch(async (_input, init) => {
    calls.push(init?.method ?? "GET");
    return jsonResponse(403, { error: { code: 403, status: "PERMISSION_DENIED" } });
  }, async () => {
    await assert.rejects(
      () => ensureAcceptedAdmissionsCalendar("token", "cal-existing"),
      (error: unknown) => error instanceof GoogleCalendarRequestError && error.status === 403,
    );
  });
  assert.deepEqual(calls, ["GET"]);
});

test("freebusy queries primary plus the app calendar", async () => {
  assert.equal(sessionEventCalendarId(null), "primary");
  assert.equal(sessionEventCalendarId("  "), "primary");
  assert.equal(sessionEventCalendarId("cal-app"), "cal-app");
  assert.deepEqual(availabilityCalendarIds(null), ["primary"]);
  assert.deepEqual(availabilityCalendarIds("primary"), ["primary"]);
  assert.deepEqual(availabilityCalendarIds("cal-app"), ["primary", "cal-app"]);

  await withFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { items?: Array<{ id: string }> };
    assert.deepEqual(body.items, [{ id: "primary" }, { id: "cal-app" }]);
    return jsonResponse(200, {
      calendars: {
        primary: { busy: [{ start: "2026-10-18T14:00:00.000Z", end: "2026-10-18T15:00:00.000Z" }] },
        "cal-app": { busy: [{ start: "2026-10-18T16:00:00.000Z", end: "2026-10-18T17:00:00.000Z" }] },
      },
    });
  }, async () => {
    const busy = await listGoogleBusyWindows(
      "token",
      availabilityCalendarIds("cal-app"),
      new Date("2026-10-18T00:00:00.000Z"),
      new Date("2026-10-19T00:00:00.000Z"),
    );
    assert.equal(busy.length, 2);
  });
});

test("a 403 or 404 on a legacy primary event alerts without throwing or logging PII", async () => {
  const logs: unknown[] = [];
  let manual = 0;
  const onManualEdit = async (sessionId: string) => {
    assert.equal(sessionId, "session-1");
    manual += 1;
  };
  const log = (fields: { event: string; sessionId: string; status: number }) => {
    logs.push(fields);
  };
  const denied = await runStoredCalendarWrite({
    calendarId: null,
    sessionId: "session-1",
    write: async () => {
      throw new GoogleCalendarRequestError(
        403,
        "insufficient",
        "Request had insufficient authentication scopes for tutor@example.com",
      );
    },
    onManualEdit,
    log,
  });
  assert.deepEqual(denied, { status: "manual" });
  const missing = await runStoredCalendarWrite({
    calendarId: "primary",
    sessionId: "session-1",
    write: async () => ({ missing: true }),
    onManualEdit,
    log,
  });
  assert.deepEqual(missing, { status: "manual" });
  assert.equal(manual, 2);
  assert.deepEqual(logs, [
    { event: "calendar.legacy_event_unwritable", sessionId: "session-1", status: 403 },
    { event: "calendar.legacy_event_unwritable", sessionId: "session-1", status: 404 },
  ]);
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes("@"), false);
  assert.equal(serialized.includes("example.com"), false);
  assert.equal(serialized.includes("tutor"), false);
});

test("a 403 on the app calendar still throws, and a missing app event does not alert", async () => {
  let manual = 0;
  await assert.rejects(
    () =>
      runStoredCalendarWrite({
        calendarId: "cal-app",
        sessionId: "session-2",
        write: async () => {
          throw new GoogleCalendarRequestError(403, "forbidden", "forbidden");
        },
        onManualEdit: async () => {
          manual += 1;
        },
        log: () => {
          throw new Error("legacy log should not run");
        },
      }),
    (error: unknown) => error instanceof GoogleCalendarRequestError && error.status === 403,
  );
  const gone = await runStoredCalendarWrite({
    calendarId: "cal-app",
    sessionId: "session-2",
    write: async () => ({ missing: true, id: "evt-2" }),
    onManualEdit: async () => {
      manual += 1;
    },
    log: () => {
      throw new Error("legacy log should not run");
    },
  });
  assert.equal(gone.status, "updated");
  assert.equal(manual, 0);
});

test("a stored grant without calendar.app.created needs reconnect and stays connected", () => {
  assert.equal(
    calendarGrantNeedsReconnect({ hasRefreshToken: true, grantedScopes: null, appCalendarId: null }),
    true,
  );
  assert.equal(calendarGrantNeedsReconnect({ hasRefreshToken: true }), false);
  assert.equal(
    calendarGrantNeedsReconnect({ hasRefreshToken: false, grantedScopes: null, appCalendarId: null }),
    false,
  );
  const legacy = buildCalendarConnectionHealth({
    tutorProfileId: "tutor-1",
    name: "Xavier Morales",
    portalEmail: "xaver.rmz6@gmail.com",
    hasRefreshToken: true,
    connectionStatus: "connected",
    grantedScopes: null,
    appCalendarId: null,
  });
  assert.equal(legacy.badge, "needs_reconnect");
  assert.equal(legacy.connectionStatus, "connected");
  assert.equal(legacy.hasRefreshToken, true);
  assert.equal(
    calendarHealthBadge({
      hasRefreshToken: true,
      grantedScopes: REQUESTED_SCOPES.join(" "),
      appCalendarId: "cal-app",
    }),
    "healthy",
  );
  assert.equal(
    calendarHealthBadge({
      hasRefreshToken: true,
      grantedScopes: "openid email https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events",
      appCalendarId: "cal-app",
    }),
    "needs_reconnect",
  );
});

test("session writes use the app calendar and a missing scope does not disconnect the grant", async () => {
  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const health = await readFile(
    fileURLToPath(new URL("./calendar-connection-health.ts", import.meta.url)),
    "utf8",
  );
  const createStart = platform.indexOf('router.post("/booking/sessions"');
  const cancelStart = platform.indexOf('router.post("/booking/sessions/:sessionId/cancel"');
  const createSlice = platform.slice(createStart, cancelStart);
  assert.match(createSlice, /CALENDAR_RECONNECT_REQUIRED/);
  assert.match(createSlice, /createGoogleEvent\(\s*token,\s*appCalendarId,/);
  assert.match(createSlice, /providerCalendarId:\s*appCalendarId/);
  assert.equal(createSlice.includes("connection.calendarId"), false);
  const rescheduleStart = platform.indexOf('router.post("/booking/sessions/:sessionId/reschedule"');
  const rescheduleSlice = platform.slice(cancelStart, platform.indexOf("async function financialSummary", rescheduleStart));
  assert.match(rescheduleSlice, /sessionEventCalendarId\(session\.providerCalendarId\)/);
  assert.match(rescheduleSlice, /writeStoredSessionEvent\(session/);
  assert.match(rescheduleSlice, /raiseLegacyCalendarManualEditAlert|writeStoredSessionEvent/);
  const ensureStart = platform.indexOf("const appCalendarId = await ensureAcceptedAdmissionsCalendar");
  const ensureSlice = platform.slice(ensureStart, platform.indexOf('logCallback("info", "connected"', ensureStart));
  assert.match(ensureSlice, /saveAcceptedAdmissionsCalendarId/);
  assert.equal(/markGoogleCalendarDisconnected|revokeGoogleCalendarGrant|disconnectGoogleCalendarConnection/.test(ensureSlice), false);
  assert.equal(/markGoogleCalendarDisconnected|revokeGoogleCalendarGrant|disconnectGoogleCalendar/.test(health), false);
  assert.match(platform, /tutorFreeBusyCalendarIds\(access\.connection\)/);
  assert.match(platform, /listGoogleBusyWindows\(\s*token,\s*"primary"/);
});
