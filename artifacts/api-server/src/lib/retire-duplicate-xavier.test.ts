import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { shouldAdoptLoserCalendarConnection } from "./calendar-connection-adopt.ts";

test("Xavier identity remaps adopt a loser refresh token when the winner row is empty or disconnected", () => {
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
      { status: "disconnected", encryptedRefreshToken: null },
      { encryptedRefreshToken: null },
    ),
    false,
  );
});
