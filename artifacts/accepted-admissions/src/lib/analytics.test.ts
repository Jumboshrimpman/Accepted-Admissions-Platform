import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  trackCalendarConnection,
  type CalendarConnectionOutcome,
} from "./analytics.ts";

const outcomes: CalendarConnectionOutcome[] = [
  "popup_launched",
  "popup_blocked",
  "connected",
  "cancelled",
  "rejected",
  "failed",
  "disconnected",
  "disconnect_failed",
];

test("sends every calendar outcome to the injected analytics transport with only safe dimensions", () => {
  const events: Array<{ name: string; data?: Record<string, unknown> }> = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      umami: {
        track(name: string, data?: Record<string, unknown>) {
          events.push({ name, data });
        },
      },
    },
  });

  try {
    for (const outcome of outcomes) {
      trackCalendarConnection("administrator", "admin_dashboard", outcome);
    }
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }

  assert.deepEqual(
    events,
    outcomes.map((outcome) => ({
      name: "calendar_connection",
      data: {
        role: "administrator",
        location: "admin_dashboard",
        outcome,
      },
    })),
  );
});

test("analytics transport failures never escape into calendar behavior", () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      umami: {
        track() {
          throw new Error("analytics unavailable");
        },
      },
    },
  });

  try {
    assert.doesNotThrow(() => {
      trackCalendarConnection("tutor", "tutor_dashboard", "connected");
    });
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});