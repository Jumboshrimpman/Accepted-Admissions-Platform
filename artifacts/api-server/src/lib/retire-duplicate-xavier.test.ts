import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  describeStoredGoogleCalendarConnection,
  shouldAdoptLoserCalendarConnection,
} from "./calendar-connection-adopt.ts";

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
