import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { adoptedGoogleCalendarConnectionStatus, describeStoredGoogleCalendarConnection, encryptedRefreshTokenAfterConnect, shouldAdoptLoserCalendarConnection, shouldSelfHealGoogleCalendarConnection, storedRefreshTokenKeepsCalendarConnected } from "./calendar-connection-adopt.ts";

test("Xavier identity remaps adopt a loser refresh token only when the winner has none", () => {
  assert.equal(
    shouldAdoptLoserCalendarConnection(
      { status: "disconnected", encryptedRefreshToken: null },
      { encryptedRefreshToken: "loser-refresh" },
    ),
    true,
  );
  assert.equal(
    shouldAdoptLoserCalendarConnection(null, { encryptedRefreshToken: "loser-refresh" }),
    true,
  );
  assert.equal(
    shouldAdoptLoserCalendarConnection(
      { status: "connected", encryptedRefreshToken: "winner-refresh" },
      { encryptedRefreshToken: "loser-refresh" },
    ),
    false,
  );
  assert.equal(
    shouldAdoptLoserCalendarConnection(
      { status: "disconnected", encryptedRefreshToken: "winner-refresh" },
      { encryptedRefreshToken: "loser-refresh" },
    ),
    false,
  );
  assert.equal(
    shouldAdoptLoserCalendarConnection(
      { status: "disconnected", encryptedRefreshToken: null },
      { encryptedRefreshToken: null },
    ),
    false,
  );
});

test("Google returns no new refresh_token on reconnect keeps prior", () => {
  const encrypt = (value: string) => `enc:${value}`;
  assert.equal(
    encryptedRefreshTokenAfterConnect("enc:prior-refresh", undefined, encrypt),
    "enc:prior-refresh",
  );
  assert.equal(
    encryptedRefreshTokenAfterConnect("enc:prior-refresh", "", encrypt),
    "enc:prior-refresh",
  );
  assert.equal(
    encryptedRefreshTokenAfterConnect("enc:prior-refresh", "   ", encrypt),
    "enc:prior-refresh",
  );
  assert.equal(
    encryptedRefreshTokenAfterConnect("enc:prior-refresh", "rotated-refresh", encrypt),
    "enc:rotated-refresh",
  );
  assert.equal(encryptedRefreshTokenAfterConnect(null, undefined, encrypt), null);
  assert.equal(encryptedRefreshTokenAfterConnect(undefined, "fresh-refresh", encrypt), "enc:fresh-refresh");
});

test("boot and adopt keep a stored refresh token looking connected", () => {
  assert.equal(
    storedRefreshTokenKeepsCalendarConnected({
      status: "disconnected",
      calendarId: null,
      encryptedRefreshToken: "stored-refresh",
    }),
    true,
  );
  assert.equal(
    storedRefreshTokenKeepsCalendarConnected({
      status: "connected",
      calendarId: "primary",
      encryptedRefreshToken: "stored-refresh",
    }),
    true,
  );
  assert.equal(
    storedRefreshTokenKeepsCalendarConnected({
      status: "disconnected",
      calendarId: "primary",
      encryptedRefreshToken: null,
    }),
    false,
  );
  assert.equal(
    storedRefreshTokenKeepsCalendarConnected({
      status: "disconnected",
      calendarId: null,
      encryptedRefreshToken: "   ",
    }),
    true,
  );
  assert.equal(
    adoptedGoogleCalendarConnectionStatus({
      status: "disconnected",
      encryptedRefreshToken: "loser-refresh",
    }),
    "connected",
  );
  assert.equal(
    adoptedGoogleCalendarConnectionStatus({
      status: "disconnected",
      encryptedRefreshToken: null,
    }),
    "disconnected",
  );
  assert.equal(
    adoptedGoogleCalendarConnectionStatus({
      status: "connected",
      encryptedRefreshToken: null,
    }),
    "connected",
  );
});

test("stranded refresh token can self-heal until the tutor disconnects", () => {
  assert.equal(
    shouldSelfHealGoogleCalendarConnection({
      status: "disconnected",
      calendarId: "primary",
      encryptedRefreshToken: "stored-refresh",
    }),
    true,
  );
  assert.equal(
    shouldSelfHealGoogleCalendarConnection({
      status: "connected",
      calendarId: "primary",
      encryptedRefreshToken: "stored-refresh",
    }),
    false,
  );
  assert.equal(
    shouldSelfHealGoogleCalendarConnection({
      status: "disconnected",
      calendarId: null,
      encryptedRefreshToken: "stored-refresh",
    }),
    false,
  );
  assert.equal(
    shouldSelfHealGoogleCalendarConnection({
      status: "disconnected",
      calendarId: "primary",
      encryptedRefreshToken: null,
    }),
    false,
  );
});

test("calendar diagnostics report token presence without ciphertext", () => {
  const ciphertext = "iv.tag.encrypted-refresh-secret";
  const stranded = describeStoredGoogleCalendarConnection({
    status: "disconnected",
    encryptedRefreshToken: ciphertext,
    encryptedAccessToken: "iv.tag.encrypted-access-secret",
    accessTokenExpiresAt: new Date("2026-09-27T16:00:00.000Z"),
  });
  assert.deepEqual(stranded, {
    connectionStatus: "disconnected",
    hasRefreshToken: true,
    hasAccessToken: true,
    accessTokenExpiresAt: "2026-09-27T16:00:00.000Z",
    googleReconnectRequired: false,
  });
  assert.equal(JSON.stringify(stranded).includes(ciphertext), false);

  assert.deepEqual(describeStoredGoogleCalendarConnection(null), {
    connectionStatus: null,
    hasRefreshToken: false,
    hasAccessToken: false,
    accessTokenExpiresAt: null,
    googleReconnectRequired: true,
  });
  assert.equal(
    describeStoredGoogleCalendarConnection({
      status: "disconnected",
      encryptedRefreshToken: null,
      encryptedAccessToken: null,
    }).googleReconnectRequired,
    true,
  );
});
