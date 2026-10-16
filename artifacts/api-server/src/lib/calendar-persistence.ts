import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import {
  calendarConnectionsTable,
  db,
  tutorProfilesTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { encryptCalendarToken, googleAccessTokenExpiresAt } from "./google-calendar.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { adoptedGoogleCalendarConnectionStatus, connectionHasRefreshToken, encryptedRefreshTokenAfterConnect } from "./calendar-connection-adopt.ts";

export {
  connectionHasRefreshToken,
  connectionLooksConnected,
  shouldAdoptLoserCalendarConnection,
} from "./calendar-connection-adopt.ts";

export const GOOGLE_CALENDAR_REFRESH_TOKEN_MISSING =
  "GOOGLE_CALENDAR_REFRESH_TOKEN_MISSING";

export type GoogleCalendarTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  email?: string;
  scope?: string;
};

const CALENDAR_GRANT_REVOKED_ERROR =
  "Google revoked the calendar grant. Reconnect is required.";
const CALENDAR_TUTOR_DISCONNECTED_ERROR = "The tutor disconnected Google Calendar.";
const CALENDAR_DISCONNECTED_ERROR =
  "Google Calendar is disconnected. Reconnect is required.";

function normalizedGoogleAccountEmail(email: string | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? "";
  if (!trimmed.includes("@") || trimmed.length > 320) return null;
  return trimmed;
}

export async function persistGoogleCalendarConnection(
  tutorProfileId: string,
  tokens: GoogleCalendarTokens,
  connectedAt = new Date(),
) {
  const accessTokenExpiresAt = googleAccessTokenExpiresAt(tokens.expiresIn, connectedAt);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: calendarConnectionsTable.id,
        encryptedRefreshToken: calendarConnectionsTable.encryptedRefreshToken,
      })
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, tutorProfileId),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      )
      .limit(1);
    const nextRefreshToken = encryptedRefreshTokenAfterConnect(
      existing?.encryptedRefreshToken,
      tokens.refreshToken,
      encryptCalendarToken,
    );
    if (!nextRefreshToken) {
      throw new Error(GOOGLE_CALENDAR_REFRESH_TOKEN_MISSING);
    }
    const googleAccountEmail = normalizedGoogleAccountEmail(tokens.email);
    const grantedScopes = tokens.scope?.trim() || null;
    const insertValues = {
      tutorProfileId,
      provider: "google",
      status: "connected",
      calendarId: "primary",
      ...(grantedScopes ? { grantedScopes } : {}),
      encryptedAccessToken: encryptCalendarToken(tokens.accessToken),
      encryptedRefreshToken: nextRefreshToken,
      accessTokenExpiresAt,
      connectedAt,
      googleAccountEmail,
      lastError: null,
      lastErrorAt: null,
      updatedAt: connectedAt,
    };
    const updateValues = {
      status: insertValues.status,
      calendarId: insertValues.calendarId,
      encryptedAccessToken: insertValues.encryptedAccessToken,
      encryptedRefreshToken: nextRefreshToken,
      accessTokenExpiresAt,
      connectedAt,
      lastError: null,
      lastErrorAt: null,
      updatedAt: connectedAt,
      ...(googleAccountEmail ? { googleAccountEmail } : {}),
      ...(grantedScopes ? { grantedScopes } : {}),
    };
    const [connection] = await tx
      .insert(calendarConnectionsTable)
      .values(insertValues)
      .onConflictDoUpdate({
        target: [
          calendarConnectionsTable.tutorProfileId,
          calendarConnectionsTable.provider,
        ],
        set: updateValues,
      })
      .returning();
    const [profile] = await tx
      .update(tutorProfilesTable)
      .set({ calendarStatus: "connected", updatedAt: connectedAt })
      .where(eq(tutorProfilesTable.id, tutorProfileId))
      .returning({ id: tutorProfilesTable.id });
    if (!connection || !profile) {
      throw new Error("Calendar connection could not be persisted");
    }
    return connection;
  });
}

export async function adoptGoogleCalendarConnection(
  fromProfileId: string,
  toProfileId: string,
  adoptedAt = new Date(),
) {
  if (!fromProfileId || !toProfileId || fromProfileId === toProfileId) return null;

  return db.transaction(async (tx) => {
    const [from] = await tx
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, fromProfileId),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      )
      .limit(1);
    if (!from || !connectionHasRefreshToken(from)) return null;

    const [to] = await tx
      .select()
      .from(calendarConnectionsTable)
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, toProfileId),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      )
      .limit(1);
    if (to && connectionHasRefreshToken(to) && to.id !== from.id) {
      return to;
    }

    const adoptedValues = {
      tutorProfileId: toProfileId,
      status: adoptedGoogleCalendarConnectionStatus(from),
      calendarId: from.calendarId ?? "primary",
      encryptedAccessToken: from.encryptedAccessToken,
      encryptedRefreshToken: from.encryptedRefreshToken,
      accessTokenExpiresAt: from.accessTokenExpiresAt,
      connectedAt: from.connectedAt ?? adoptedAt,
      googleAccountEmail: from.googleAccountEmail,
      appCalendarId: from.appCalendarId,
      grantedScopes: from.grantedScopes,
      lastTokenRefreshAt: from.lastTokenRefreshAt,
      lastFreeBusyAt: from.lastFreeBusyAt,
      lastError: from.lastError,
      lastErrorAt: from.lastErrorAt,
      updatedAt: adoptedAt,
    };

    const [adopted] = to
      ? await tx
          .update(calendarConnectionsTable)
          .set(adoptedValues)
          .where(eq(calendarConnectionsTable.id, to.id))
          .returning()
      : await tx
          .update(calendarConnectionsTable)
          .set(adoptedValues)
          .where(eq(calendarConnectionsTable.id, from.id))
          .returning();

    if (to && adopted) {
      await tx
        .update(calendarConnectionsTable)
        .set({
          status: "disconnected",
          calendarId: null,
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          accessTokenExpiresAt: null,
          connectedAt: null,
          googleAccountEmail: null,
          appCalendarId: null,
          grantedScopes: null,
          lastTokenRefreshAt: null,
          lastFreeBusyAt: null,
          lastError: null,
          lastErrorAt: null,
          updatedAt: adoptedAt,
        })
        .where(eq(calendarConnectionsTable.id, from.id));
    }

    if (connectionHasRefreshToken(from) || adopted?.status === "connected") {
      await tx
        .update(tutorProfilesTable)
        .set({ calendarStatus: "connected", updatedAt: adoptedAt })
        .where(eq(tutorProfilesTable.id, toProfileId));
    }
    return adopted ?? null;
  });
}

export async function saveRefreshedGoogleAccessToken(
  connectionId: string,
  accessToken: string,
  expiresIn?: number,
  refreshedAt = new Date(),
  rotatedRefreshToken?: string,
) {
  const [connection] = await db
    .update(calendarConnectionsTable)
    .set({
      status: "connected",
      encryptedAccessToken: encryptCalendarToken(accessToken),
      ...(rotatedRefreshToken
        ? { encryptedRefreshToken: encryptCalendarToken(rotatedRefreshToken) }
        : {}),
      accessTokenExpiresAt: googleAccessTokenExpiresAt(expiresIn, refreshedAt),
      lastTokenRefreshAt: refreshedAt,
      lastError: null,
      lastErrorAt: null,
      updatedAt: refreshedAt,
    })
    .where(eq(calendarConnectionsTable.id, connectionId))
    .returning();
  if (!connection) throw new Error("Calendar connection no longer exists");
  await db
    .update(tutorProfilesTable)
    .set({ calendarStatus: "connected", updatedAt: refreshedAt })
    .where(eq(tutorProfilesTable.id, connection.tutorProfileId));
  return connection;
}

export async function saveAcceptedAdmissionsCalendarId(
  connectionId: string,
  appCalendarId: string,
  savedAt = new Date(),
  grantedScopes?: string | null,
) {
  const scopes = grantedScopes?.trim() || null;
  const [connection] = await db
    .update(calendarConnectionsTable)
    .set({
      appCalendarId,
      ...(scopes ? { grantedScopes: scopes } : {}),
      updatedAt: savedAt,
    })
    .where(eq(calendarConnectionsTable.id, connectionId))
    .returning();
  if (!connection) throw new Error("Calendar connection no longer exists");
  return connection;
}

export async function markGoogleCalendarConnected(
  tutorProfileId: string,
  connectionId: string,
  connectedAt = new Date(),
) {
  await db.transaction(async (tx) => {
    await tx
      .update(calendarConnectionsTable)
      .set({ status: "connected", updatedAt: connectedAt })
      .where(eq(calendarConnectionsTable.id, connectionId));
    await tx
      .update(tutorProfilesTable)
      .set({ calendarStatus: "connected", updatedAt: connectedAt })
      .where(eq(tutorProfilesTable.id, tutorProfileId));
  });
}

export async function markGoogleCalendarDisconnected(
  tutorProfileId: string,
  connectionId?: string,
  disconnectedAt = new Date(),
) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: calendarConnectionsTable.id,
        encryptedRefreshToken: calendarConnectionsTable.encryptedRefreshToken,
      })
      .from(calendarConnectionsTable)
      .where(
        connectionId
          ? eq(calendarConnectionsTable.id, connectionId)
          : and(
              eq(calendarConnectionsTable.tutorProfileId, tutorProfileId),
              eq(calendarConnectionsTable.provider, "google"),
            ),
      );
    const grants = rows.filter((row) => connectionHasRefreshToken(row));
    if (grants.length > 0) {
      const grantIds = grants.map((row) => row.id);
      await tx
        .update(calendarConnectionsTable)
        .set({ status: "connected", updatedAt: disconnectedAt })
        .where(inArray(calendarConnectionsTable.id, grantIds));
      await tx
        .update(calendarConnectionsTable)
        .set({ calendarId: "primary", updatedAt: disconnectedAt })
        .where(
          and(
            inArray(calendarConnectionsTable.id, grantIds),
            isNull(calendarConnectionsTable.calendarId),
          ),
        );
      await tx
        .update(tutorProfilesTable)
        .set({ calendarStatus: "connected", updatedAt: disconnectedAt })
        .where(eq(tutorProfilesTable.id, tutorProfileId));
      return;
    }
    await tx
      .update(calendarConnectionsTable)
      .set({
        status: "disconnected",
        lastError: CALENDAR_DISCONNECTED_ERROR,
        lastErrorAt: disconnectedAt,
        updatedAt: disconnectedAt,
      })
      .where(
        connectionId
          ? eq(calendarConnectionsTable.id, connectionId)
          : and(
              eq(calendarConnectionsTable.tutorProfileId, tutorProfileId),
              eq(calendarConnectionsTable.provider, "google"),
            ),
      );
    await tx
      .update(tutorProfilesTable)
      .set({ calendarStatus: "disconnected", updatedAt: disconnectedAt })
      .where(eq(tutorProfilesTable.id, tutorProfileId));
  });
}

/** Confirmed invalid_grant only. Clears the dead grant so it cannot be healed. */
export async function revokeGoogleCalendarGrant(
  tutorProfileId: string,
  connectionId?: string,
  revokedAt = new Date(),
) {
  return db.transaction(async (tx) => {
    await tx
      .update(calendarConnectionsTable)
      .set({
        status: "disconnected",
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        accessTokenExpiresAt: null,
        lastError: CALENDAR_GRANT_REVOKED_ERROR,
        lastErrorAt: revokedAt,
        updatedAt: revokedAt,
      })
      .where(
        connectionId
          ? eq(calendarConnectionsTable.id, connectionId)
          : and(
              eq(calendarConnectionsTable.tutorProfileId, tutorProfileId),
              eq(calendarConnectionsTable.provider, "google"),
            ),
      );
    await tx
      .update(tutorProfilesTable)
      .set({ calendarStatus: "disconnected", updatedAt: revokedAt })
      .where(eq(tutorProfilesTable.id, tutorProfileId));
  });
}

/**
 * Boot and identity cleanup. Any Google row that still has a refresh token is
 * connected. This undoes status-only disconnects (including historical migrations)
 * without calling Google and without touching a revoked grant whose token was cleared.
 */
export async function reconnectStoredGoogleCalendarGrants(healedAt = new Date()) {
  const stored = await db
    .select({
      id: calendarConnectionsTable.id,
      tutorProfileId: calendarConnectionsTable.tutorProfileId,
      status: calendarConnectionsTable.status,
      calendarId: calendarConnectionsTable.calendarId,
      encryptedRefreshToken: calendarConnectionsTable.encryptedRefreshToken,
    })
    .from(calendarConnectionsTable)
    .where(
      and(
        eq(calendarConnectionsTable.provider, "google"),
        isNotNull(calendarConnectionsTable.encryptedRefreshToken),
      ),
    );
  const grants = stored.filter((row) => connectionHasRefreshToken(row));
  const disconnectedIds = grants
    .filter((row) => row.status !== "connected")
    .map((row) => row.id);
  if (disconnectedIds.length > 0) {
    await db
      .update(calendarConnectionsTable)
      .set({ status: "connected", updatedAt: healedAt })
      .where(inArray(calendarConnectionsTable.id, disconnectedIds));
  }
  const missingCalendarIds = grants.filter((row) => !row.calendarId).map((row) => row.id);
  if (missingCalendarIds.length > 0) {
    await db
      .update(calendarConnectionsTable)
      .set({ calendarId: "primary", updatedAt: healedAt })
      .where(
        and(
          inArray(calendarConnectionsTable.id, missingCalendarIds),
          isNull(calendarConnectionsTable.calendarId),
        ),
      );
  }
  const profileIds = [...new Set(grants.map((row) => row.tutorProfileId))];
  if (profileIds.length > 0) {
    await db
      .update(tutorProfilesTable)
      .set({ calendarStatus: "connected", updatedAt: healedAt })
      .where(
        and(
          inArray(tutorProfilesTable.id, profileIds),
          ne(tutorProfilesTable.calendarStatus, "connected"),
        ),
      );
  }
  return {
    connectionsHealed: disconnectedIds.length,
    grants: grants.length,
  };
}

export async function disconnectGoogleCalendarConnection(
  tutorProfileId: string,
  disconnectedAt = new Date(),
) {
  return db.transaction(async (tx) => {
    await tx
      .update(calendarConnectionsTable)
      .set({
        status: "disconnected",
        calendarId: null,
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        accessTokenExpiresAt: null,
        lastError: CALENDAR_TUTOR_DISCONNECTED_ERROR,
        lastErrorAt: disconnectedAt,
        updatedAt: disconnectedAt,
      })
      .where(
        and(
          eq(calendarConnectionsTable.tutorProfileId, tutorProfileId),
          eq(calendarConnectionsTable.provider, "google"),
        ),
      );
    await tx
      .update(tutorProfilesTable)
      .set({ calendarStatus: "disconnected", updatedAt: disconnectedAt })
      .where(eq(tutorProfilesTable.id, tutorProfileId));
  });
}