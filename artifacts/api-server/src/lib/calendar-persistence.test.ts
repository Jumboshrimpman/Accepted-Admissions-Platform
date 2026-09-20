import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import {
  calendarConnectionsTable,
  db,
  tutorProfilesTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { decryptCalendarToken } from "./google-calendar.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { adoptGoogleCalendarConnection, disconnectGoogleCalendarConnection, GOOGLE_CALENDAR_REFRESH_TOKEN_MISSING, markGoogleCalendarDisconnected, persistGoogleCalendarConnection, saveRefreshedGoogleAccessToken } from "./calendar-persistence.ts";

process.env.SESSION_SECRET ??= "calendar-persistence-test-secret";

test("Google Calendar credentials persist through reconnect, refresh, and disconnect", async () => {
  const suffix = randomUUID();
  const email = `calendar-persistence-${suffix}@example.com`;
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `calendar-test:${suffix}`,
      email,
      displayName: "Calendar Persistence Test",
      role: "tutor",
    })
    .returning();
  const [profile] = await db
    .insert(tutorProfilesTable)
    .values({
      userId: user!.id,
      email,
      name: "Calendar Persistence Test",
      title: "Test Tutor",
      bookingEligible: false,
    })
    .returning();

  try {
    const connectedAt = new Date("2026-08-31T12:00:00.000Z");
    await persistGoogleCalendarConnection(
      profile!.id,
      {
        accessToken: "first-access-token",
        refreshToken: "durable-refresh-token",
        expiresIn: 3600,
      },
      connectedAt,
    );
    await Promise.all([
      persistGoogleCalendarConnection(
        profile!.id,
        { accessToken: "second-access-token", expiresIn: 3600 },
        new Date("2026-08-31T12:01:00.000Z"),
      ),
      persistGoogleCalendarConnection(
        profile!.id,
        { accessToken: "third-access-token", expiresIn: 3600 },
        new Date("2026-08-31T12:02:00.000Z"),
      ),
    ]);

    const connectedRows = await db
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, profile!.id),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      );
    assert.equal(connectedRows.length, 1);
    assert.equal(connectedRows[0]!.status, "connected");
    assert.notEqual(
      connectedRows[0]!.encryptedAccessToken,
      "third-access-token",
    );
    assert.equal(
      decryptCalendarToken(connectedRows[0]!.encryptedRefreshToken!),
      "durable-refresh-token",
    );
    assert.equal(
      connectedRows[0]!.accessTokenExpiresAt?.toISOString(),
      "2026-08-31T13:02:00.000Z",
    );

    const [connectedProfile] = await db
      .select({ calendarStatus: tutorProfilesTable.calendarStatus })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, profile!.id));
    assert.equal(connectedProfile!.calendarStatus, "connected");

    await saveRefreshedGoogleAccessToken(
      connectedRows[0]!.id,
      "refreshed-access-token",
      1800,
      new Date("2026-08-31T13:00:00.000Z"),
    );
    const [refreshed] = await db
      .select()
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.id, connectedRows[0]!.id));
    assert.equal(
      decryptCalendarToken(refreshed!.encryptedAccessToken!),
      "refreshed-access-token",
    );
    assert.equal(
      decryptCalendarToken(refreshed!.encryptedRefreshToken!),
      "durable-refresh-token",
    );
    assert.equal(
      refreshed!.accessTokenExpiresAt?.toISOString(),
      "2026-08-31T13:30:00.000Z",
    );

    await markGoogleCalendarDisconnected(profile!.id, refreshed!.id);
    const [failedConnection] = await db
      .select({ status: calendarConnectionsTable.status })
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.id, refreshed!.id));
    const [failedProfile] = await db
      .select({ calendarStatus: tutorProfilesTable.calendarStatus })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, profile!.id));
    assert.equal(failedConnection!.status, "disconnected");
    assert.equal(failedProfile!.calendarStatus, "disconnected");

    await disconnectGoogleCalendarConnection(profile!.id);
    const [disconnected] = await db
      .select()
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.id, refreshed!.id));
    assert.equal(disconnected!.status, "disconnected");
    assert.equal(disconnected!.calendarId, null);
    assert.equal(disconnected!.encryptedAccessToken, null);
    assert.equal(disconnected!.encryptedRefreshToken, null);
    assert.equal(disconnected!.accessTokenExpiresAt, null);
  } finally {
    await db
      .delete(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.tutorProfileId, profile!.id));
    await db
      .delete(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, profile!.id));
    await db.delete(usersTable).where(eq(usersTable.id, user!.id));
  }
});

test("first Google Calendar persist requires a refresh token", async () => {
  const suffix = randomUUID();
  const email = `calendar-missing-refresh-${suffix}@example.com`;
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `calendar-missing-refresh:${suffix}`,
      email,
      displayName: "Missing Refresh Token",
      role: "tutor",
    })
    .returning();
  const [profile] = await db
    .insert(tutorProfilesTable)
    .values({
      userId: user!.id,
      email,
      name: "Missing Refresh Token",
      title: "Test Tutor",
      bookingEligible: false,
    })
    .returning();
  try {
    await assert.rejects(
      persistGoogleCalendarConnection(profile!.id, {
        accessToken: "access-only",
        expiresIn: 3600,
      }),
      (error: unknown) =>
        error instanceof Error && error.message === GOOGLE_CALENDAR_REFRESH_TOKEN_MISSING,
    );
    const rows = await db
      .select()
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.tutorProfileId, profile!.id));
    assert.equal(rows.length, 0);
  } finally {
    await db
      .delete(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.tutorProfileId, profile!.id));
    await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.id, profile!.id));
    await db.delete(usersTable).where(eq(usersTable.id, user!.id));
  }
});

test("identity remaps move a connected Google Calendar onto the surviving profile", async () => {
  const suffix = randomUUID();
  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `calendar-adopt:${suffix}`,
      email: `calendar-adopt-${suffix}@example.com`,
      displayName: "Calendar Adopt",
      role: "tutor",
    })
    .returning();
  const [fromProfile] = await db
    .insert(tutorProfilesTable)
    .values({
      userId: user!.id,
      email: `calendar-adopt-from-${suffix}@example.com`,
      name: "Calendar Adopt From",
      title: "Calendar account",
      bookingEligible: false,
    })
    .returning();
  const [toProfile] = await db
    .insert(tutorProfilesTable)
    .values({
      userId: user!.id,
      email: `calendar-adopt-to-${suffix}@example.com`,
      name: "Calendar Adopt To",
      title: "SAT Tutor",
      bookingEligible: true,
    })
    .returning();
  try {
    await persistGoogleCalendarConnection(fromProfile!.id, {
      accessToken: "adopt-access",
      refreshToken: "adopt-refresh",
      expiresIn: 3600,
    });
    const adopted = await adoptGoogleCalendarConnection(fromProfile!.id, toProfile!.id);
    assert.equal(adopted?.tutorProfileId, toProfile!.id);
    assert.equal(adopted?.status, "connected");
    assert.equal(decryptCalendarToken(adopted!.encryptedRefreshToken!), "adopt-refresh");

    const [fromRow] = await db
      .select()
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.tutorProfileId, fromProfile!.id));
    assert.equal(fromRow?.encryptedRefreshToken ?? null, null);
    const [toStatus] = await db
      .select({ calendarStatus: tutorProfilesTable.calendarStatus })
      .from(tutorProfilesTable)
      .where(eq(tutorProfilesTable.id, toProfile!.id));
    assert.equal(toStatus!.calendarStatus, "connected");
  } finally {
    await db
      .delete(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.tutorProfileId, fromProfile!.id));
    await db
      .delete(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.tutorProfileId, toProfile!.id));
    await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.id, fromProfile!.id));
    await db.delete(tutorProfilesTable).where(eq(tutorProfilesTable.id, toProfile!.id));
    await db.delete(usersTable).where(eq(usersTable.id, user!.id));
  }
});