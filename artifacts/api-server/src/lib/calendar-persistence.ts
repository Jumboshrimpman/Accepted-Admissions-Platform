import { and, eq } from "drizzle-orm";
import {
  calendarConnectionsTable,
  db,
  tutorProfilesTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { encryptCalendarToken } from "./google-calendar.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  connectionHasRefreshToken,
  connectionLooksConnected,
} from "./calendar-connection-adopt.ts";

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
};

export async function persistGoogleCalendarConnection(
  tutorProfileId: string,
  tokens: GoogleCalendarTokens,
  connectedAt = new Date(),
) {
  const encryptedRefreshToken = tokens.refreshToken
    ? encryptCalendarToken(tokens.refreshToken)
    : undefined;
  const accessTokenExpiresAt = tokens.expiresIn
    ? new Date(connectedAt.getTime() + tokens.expiresIn * 1000)
    : null;

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
    const nextRefreshToken =
      encryptedRefreshToken ?? existing?.encryptedRefreshToken ?? null;
    if (!nextRefreshToken) {
      throw new Error(GOOGLE_CALENDAR_REFRESH_TOKEN_MISSING);
    }
    const insertValues = {
      tutorProfileId,
      provider: "google",
      status: "connected",
      calendarId: "primary",
      encryptedAccessToken: encryptCalendarToken(tokens.accessToken),
      encryptedRefreshToken: nextRefreshToken,
      accessTokenExpiresAt,
      connectedAt,
      updatedAt: connectedAt,
    };
    const updateValues = {
      status: insertValues.status,
      calendarId: insertValues.calendarId,
      encryptedAccessToken: insertValues.encryptedAccessToken,
      encryptedRefreshToken: nextRefreshToken,
      accessTokenExpiresAt,
      connectedAt,
      updatedAt: connectedAt,
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
    if (connectionLooksConnected(to) && to!.id !== from.id) {
      return to;
    }

    const adoptedValues = {
      tutorProfileId: toProfileId,
      status: from.status === "connected" ? "connected" : from.status,
      calendarId: from.calendarId,
      encryptedAccessToken: from.encryptedAccessToken,
      encryptedRefreshToken: from.encryptedRefreshToken,
      accessTokenExpiresAt: from.accessTokenExpiresAt,
      connectedAt: from.connectedAt,
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
          updatedAt: adoptedAt,
        })
        .where(eq(calendarConnectionsTable.id, from.id));
    }

    if (adopted?.status === "connected") {
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
) {
  const [connection] = await db
    .update(calendarConnectionsTable)
    .set({
      encryptedAccessToken: encryptCalendarToken(accessToken),
      accessTokenExpiresAt: expiresIn
        ? new Date(refreshedAt.getTime() + expiresIn * 1000)
        : null,
      updatedAt: refreshedAt,
    })
    .where(eq(calendarConnectionsTable.id, connectionId))
    .returning();
  if (!connection) throw new Error("Calendar connection no longer exists");
  return connection;
}

export async function markGoogleCalendarDisconnected(
  tutorProfileId: string,
  connectionId?: string,
  disconnectedAt = new Date(),
) {
  return db.transaction(async (tx) => {
    await tx
      .update(calendarConnectionsTable)
      .set({ status: "disconnected", updatedAt: disconnectedAt })
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