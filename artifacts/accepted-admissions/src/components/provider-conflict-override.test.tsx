import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ProviderConflictOverridePanel } from "./provider-conflict-override";

const PROVIDER =
  "Tutor's connected calendar is busy during 2026-11-01T14:00:00.000Z–2026-11-01T15:30:00.000Z.";

describe("provider conflict override panel", () => {
  afterEach(() => {
    cleanup();
  });

  test("shows the conflicts and does not submit until the admin chooses create anyway", () => {
    const onOverride = vi.fn();
    render(
      <ProviderConflictOverridePanel
        conflicts={[PROVIDER]}
        editing={false}
        pending={false}
        onOverride={onOverride}
      />,
    );
    expect(screen.getByTestId("provider-conflict-override").textContent).toContain(PROVIDER);
    expect(onOverride).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-override-provider-conflict"));
    expect(screen.getByTestId("button-override-provider-conflict").textContent).toBe(
      "Create anyway — the tutor's calendar is busy at this time",
    );
    expect(onOverride).toHaveBeenCalledTimes(1);
  });

  test("hides the override when any conflict is not the tutor calendar", () => {
    render(
      <ProviderConflictOverridePanel
        conflicts={[PROVIDER, "Shared Google Meet · Taito · 2026-11-01T14:00:00.000Z (90 min)"]}
        editing={false}
        pending={false}
        onOverride={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("button-override-provider-conflict")).toBeNull();
  });
});
