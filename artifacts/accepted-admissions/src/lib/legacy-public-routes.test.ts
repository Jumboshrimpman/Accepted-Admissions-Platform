import assert from "node:assert/strict";
import test from "node:test";
import { LEGACY_PUBLIC_REDIRECTS } from "./legacy-public-routes.ts";

test("sends the live Wix booking and tour URLs to in-app counterparts", () => {
  assert.deepEqual(LEGACY_PUBLIC_REDIRECTS, [
    { from: "/book-online", to: "/sat" },
    { from: "/campus-tours", to: "/client-request" },
    { from: "/service-page/:rest*", to: "/client-request" },
  ]);
});
