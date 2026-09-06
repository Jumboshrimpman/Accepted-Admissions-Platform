import "./calendar-oauth-http-env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { AppUser } from "@workspace/db";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import platformRouter from "../routes/platform";
import { hasCalendarOAuthDatabase } from "./calendar-oauth-http-env";
import {
  createCalendarOAuthState,
  getGoogleCalendarConfig,
} from "./google-calendar";

function testAuthMiddleware(user: AppUser | null) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!user) {
      next();
      return;
    }
    const auth = Object.assign(
      () => ({
        tokenType: "session_token",
        userId: user.clerkUserId,
        sessionClaims: {
          userId: user.clerkUserId,
          email: user.email,
          name: user.displayName,
        },
        sessionId: `calendar-oauth-http-test:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startServer(user: AppUser | null = null) {
  const app = express();
  app.use(express.json());
  app.use(testAuthMiddleware(user));
  app.use("/api", platformRouter);
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

test("calendar OAuth callback reports a missing state as a failed HTML page", async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/calendar/oauth/callback`);
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(response.headers.get("content-type") ?? "", /html/);
    assert.match(body, /calendar-connection-failed/);
    assert.match(body, /outcome: "failed"/);
    assert.match(body, /Start Connect again from the dashboard/);
    assert.match(body, /Return to dashboard/);
  } finally {
    await server.close();
  }
});

test("calendar OAuth callback reports an invalid HMAC state as expired", async () => {
  const server = await startServer();
  try {
    const response = await fetch(
      `${server.baseUrl}/api/calendar/oauth/callback?state=not-a-valid-state`,
    );
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /outcome: "expired"/);
    assert.match(body, /expired or is no longer valid/);
  } finally {
    await server.close();
  }
});

test("calendar OAuth callback classifies Google access_denied as cancelled", async () => {
  const state = createCalendarOAuthState("tutor-profile-xavier", "app-user-xavier", {
    returnTo: "/tutor",
    redirectUri: "https://app.acceptedadmissions.org/api/calendar/oauth/callback",
  });
  const server = await startServer();
  try {
    const response = await fetch(
      `${server.baseUrl}/api/calendar/oauth/callback?${new URLSearchParams({
        state,
        error: "access_denied",
      }).toString()}`,
    );
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /outcome: "cancelled"/);
    assert.match(body, /You cancelled Google authorization/);
    assert.match(
      body,
      /https:\/\/app\.acceptedadmissions\.org\/tutor\?calendar=error&amp;reason=cancelled/,
    );
    assert.match(body, /Continue in this tab|Return to dashboard/);
  } finally {
    await server.close();
  }
});

test("calendar connect redirect surfaces a misconfigured HTML page instead of JSON", async (t) => {
  if (!hasCalendarOAuthDatabase) {
    t.skip("DATABASE_URL is required for connect-route HTML coverage");
    return;
  }
  const previous = {
    id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirect: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  };
  delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  assert.equal(getGoogleCalendarConfig(), null);

  const { calendarConnectionsTable, db, tutorProfilesTable, usersTable } =
    await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const suffix = randomUUID();
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `calendar-oauth-http:${suffix}`,
      email: `calendar-oauth-http-${suffix}@example.invalid`,
      displayName: "Calendar OAuth HTTP Tutor",
      role: "tutor",
    })
    .returning();
  await db.insert(tutorProfilesTable).values({
    userId: user!.id,
    email: user!.email,
    name: "Calendar OAuth HTTP Tutor",
    title: "SAT Tutor",
    subjects: ["SAT"],
    bookingEligible: true,
  });
  const server = await startServer(user!);
  try {
    const jsonResponse = await fetch(`${server.baseUrl}/api/calendar/connect`);
    assert.equal(jsonResponse.status, 503);
    assert.deepEqual(await jsonResponse.json(), {
      code: "CALENDAR_NOT_CONFIGURED",
      error: "Google Calendar is not configured for this workspace.",
    });

    const redirectResponse = await fetch(
      `${server.baseUrl}/api/calendar/connect?redirect=1&returnTo=${encodeURIComponent("/tutor")}`,
      { redirect: "manual" },
    );
    const body = await redirectResponse.text();
    assert.equal(redirectResponse.status, 503);
    assert.match(redirectResponse.headers.get("content-type") ?? "", /html/);
    assert.match(body, /outcome: "misconfigured"/);
    assert.match(body, /not configured for this workspace/);
    assert.doesNotMatch(body, /CALENDAR_NOT_CONFIGURED/);
  } finally {
    await server.close();
    await db
      .delete(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.tutorProfileId, user!.id));
    await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.userId, user!.id));
    await db.delete(usersTable).where(eq(usersTable.id, user!.id));
    process.env.GOOGLE_CALENDAR_CLIENT_ID = previous.id;
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = previous.secret;
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = previous.redirect;
  }
});

test("calendar connect redirect sends Google the browser-facing callback URL", async (t) => {
  if (!hasCalendarOAuthDatabase) {
    t.skip("DATABASE_URL is required for connect-route redirect coverage");
    return;
  }
  const previous = {
    id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirect: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
    origin: process.env.APP_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
  };
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "calendar-http-client-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "calendar-http-client-secret";
  process.env.GOOGLE_CALENDAR_REDIRECT_URI =
    "https://stale.vercel.app/api/calendar/oauth/callback";
  process.env.APP_ORIGIN = "https://stale.vercel.app";
  process.env.NODE_ENV = "production";

  const { db, tutorProfilesTable, usersTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const suffix = randomUUID();
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `calendar-oauth-redirect:${suffix}`,
      email: `xaver.rmz6+${suffix}@gmail.com`,
      displayName: "Xavier Calendar HTTP",
      role: "tutor",
    })
    .returning();
  await db.insert(tutorProfilesTable).values({
    userId: user!.id,
    email: user!.email,
    name: "Xavier Calendar HTTP",
    title: "SAT Tutor",
    subjects: ["SAT"],
    bookingEligible: true,
  });
  const server = await startServer(user!);
  try {
    const response = await fetch(
      `${server.baseUrl}/api/calendar/connect?redirect=1&returnTo=${encodeURIComponent("/tutor")}`,
      {
        redirect: "manual",
        headers: {
          host: "accepted-admissions-platform-production.up.railway.app",
          "x-forwarded-host": "app.acceptedadmissions.org",
          "x-forwarded-proto": "https",
        },
      },
    );
    assert.equal(response.status, 302);
    const location = response.headers.get("location") ?? "";
    const parsed = new URL(location);
    assert.equal(parsed.origin, "https://accounts.google.com");
    assert.equal(
      parsed.searchParams.get("redirect_uri"),
      "https://app.acceptedadmissions.org/api/calendar/oauth/callback",
    );
    assert.equal(parsed.searchParams.get("login_hint"), user!.email);
    const state = parsed.searchParams.get("state");
    assert.ok(state);
  } finally {
    await server.close();
    await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.userId, user!.id));
    await db.delete(usersTable).where(eq(usersTable.id, user!.id));
    process.env.GOOGLE_CALENDAR_CLIENT_ID = previous.id;
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = previous.secret;
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = previous.redirect;
    process.env.APP_ORIGIN = previous.origin;
    process.env.NODE_ENV = previous.nodeEnv;
  }
});
