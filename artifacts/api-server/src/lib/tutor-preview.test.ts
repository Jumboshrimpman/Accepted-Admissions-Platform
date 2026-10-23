import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { tutorPreviewWriteRejected } from "./tutor-preview.ts";

const NIKA_PREVIEW = "/api/admin/tutors/46d7cfee-d0c0-4bad-93e7-d79907301684/preview";

test("tutor preview refuses mutating requests and calendar connect", () => {
  assert.equal(
    tutorPreviewWriteRejected({ method: "GET", path: NIKA_PREVIEW }),
    false,
  );
  assert.equal(
    tutorPreviewWriteRejected({ method: "PUT", path: NIKA_PREVIEW }),
    true,
  );
  assert.equal(
    tutorPreviewWriteRejected({
      method: "PUT",
      path: "/api/admin/tutors/tutor-1/date-hours",
    }),
    false,
  );
  assert.equal(
    tutorPreviewWriteRejected({
      method: "PUT",
      path: "/api/admin/tutors/tutor-1/date-hours?preview=1",
      query: "1",
    }),
    true,
  );
  assert.equal(
    tutorPreviewWriteRejected({
      method: "PUT",
      path: "/api/tutor/date-hours",
      header: "1",
    }),
    true,
  );
  assert.equal(
    tutorPreviewWriteRejected({
      method: "PATCH",
      path: "/api/review-queue/item-1",
      header: "true",
    }),
    true,
  );
  assert.equal(
    tutorPreviewWriteRejected({
      method: "DELETE",
      path: "/api/calendar/connections/tutor-1",
      header: "1",
    }),
    true,
  );
  assert.equal(
    tutorPreviewWriteRejected({
      method: "GET",
      path: "/api/calendar/connect",
      query: "1",
    }),
    true,
  );
  assert.equal(
    tutorPreviewWriteRejected({
      method: "GET",
      path: "/api/calendar/connect",
    }),
    false,
  );
  assert.equal(
    tutorPreviewWriteRejected({
      method: "POST",
      path: "/api/admin/calendar-connections/tutor-1/reconnect-link",
      header: ["1"],
    }),
    true,
  );
});

test("tutor preview route is administrator-only and read-only on the server", () => {
  const platform = readFileSync(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const guardAt = platform.indexOf("tutorPreviewWriteRejected");
  const previewRoute = platform.indexOf('"/admin/tutors/:tutorId/preview"');
  assert.ok(guardAt > 0);
  assert.ok(previewRoute > guardAt);
  const route = platform.slice(previewRoute, previewRoute + 500);
  assert.match(route, /ensureRole\(\["administrator"\]\)/);
  assert.match(platform, /readOnly/);
  assert.match(platform, /calendarAccessReadOnly/);
  assert.doesNotMatch(
    platform.slice(previewRoute, previewRoute + 2500),
    /releaseExpiredSlotHolds|sendGuidance|createGoogleEvent|clerkClient/,
  );
});
