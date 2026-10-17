import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { UpdateAdminNotificationResponse } from "../../../../lib/api-zod/src/generated/api.ts";

const PATCH_KINDS = [
  "legacy_calendar_event",
  "client_intake_submitted",
  "hard_sat_shortfall",
  "manual_calendar_invite",
] as const;

test("PATCH /admin/notifications returns legacy_calendar_event after the row is updated", async () => {
  const platform = await readFile(
    fileURLToPath(new URL("../routes/platform.ts", import.meta.url)),
    "utf8",
  );
  const routeStart = platform.indexOf('"/admin/notifications/:notificationId"');
  const route = platform.slice(routeStart, platform.indexOf("router.patch", routeStart + 1));
  assert.match(route, /\.update\(adminNotificationsTable\)/);
  const updateAt = route.indexOf(".update(adminNotificationsTable)");
  const parseAt = route.indexOf("UpdateAdminNotificationResponse.parse");
  assert.ok(updateAt > 0);
  assert.ok(parseAt > updateAt);

  const savedAt = new Date("2026-10-16T15:00:00.000Z");
  for (const kind of PATCH_KINDS) {
    const parsed = UpdateAdminNotificationResponse.parse({
      id: "11111111-1111-4111-8111-111111111111",
      recipientUserId: "33333333-3333-4333-8333-333333333333",
      kind,
      guidanceRequestId: null,
      sessionId: "22222222-2222-4222-8222-222222222222",
      title: "Calendar event needs a manual edit",
      message: "Edit that event by hand.",
      status: "read",
      readAt: savedAt,
      dismissedAt: null,
      createdAt: savedAt,
    });
    assert.equal(parsed.kind, kind);
    assert.equal(parsed.status, "read");
    assert.equal(parsed.readAt instanceof Date, true);
  }
});
