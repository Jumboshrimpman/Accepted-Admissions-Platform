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
import { disconnectGoogleCalendarConnection, markGoogleCalendarDisconnected, persistGoogleCalendarConnection, saveRefreshedGoogleAccessToken } from "./calendar-persistence.ts";

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