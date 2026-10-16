import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientIntakeModal } from "./client-intake-modal";
import {
  RECORDING_CONSENT_EXPLANATION,
  RECORDING_CONSENT_LABEL,
  emptyIntakeDraft,
  type ClientIntakeDraft,
} from "@/lib/client-intake";

const ready: ClientIntakeDraft = {
  ...emptyIntakeDraft({ name: "Neel Dharni", email: "neel@example.com" }),
  phone: "617-555-0100",
  latestSatScore: "1480",
  latestGpa: "3.9",
  school: "Example School",
  dreamUniversity1: "Harvard",
  dreamUniversity2: "Yale",
  dreamUniversity3: "Princeton",
  mainFocus: "college_consulting",
};

afterEach(() => {
  cleanup();
});

function renderAtConsent(draft: ClientIntakeDraft) {
  const onDraft = vi.fn();
  render(
    <ClientIntakeModal
      open
      draft={draft}
      onDraft={onDraft}
      onClose={vi.fn()}
      onSubmit={vi.fn(async () => undefined)}
    />,
  );
  for (let step = 0; step < 5; step += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
  return { onDraft };
}

describe("client intake modal", () => {
  it("keeps recording consent unchecked and explains the notes", () => {
    expect(emptyIntakeDraft().recordingConsent).toBe(false);
    renderAtConsent(ready);
    const consent = screen.getByRole("checkbox", { name: RECORDING_CONSENT_LABEL });
    expect((consent as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(RECORDING_CONSENT_EXPLANATION)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit intake" }).hasAttribute("disabled")).toBe(true);
  });

  it("asks for the next SAT date only when SAT tutoring is the focus", () => {
    const onDraft = vi.fn();
    const { rerender } = render(
      <ClientIntakeModal
        open
        draft={{ ...ready, mainFocus: "" }}
        onDraft={onDraft}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );
    for (let step = 0; step < 4; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(screen.queryByLabelText("Next target SAT date")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "SAT tutoring" }));
    const last = onDraft.mock.calls.at(-1)?.[0] as ClientIntakeDraft;
    rerender(
      <ClientIntakeModal
        open
        draft={{ ...ready, mainFocus: "sat_tutoring" }}
        onDraft={onDraft}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );
    expect(screen.getByLabelText("Next target SAT date")).toBeTruthy();
    expect(last.mainFocus).toBe("sat_tutoring");
  });

  it("uses a full-height layout on small screens", () => {
    renderAtConsent(ready);
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[100dvh]");
    expect(dialog.className).toContain("w-full");
  });
});
