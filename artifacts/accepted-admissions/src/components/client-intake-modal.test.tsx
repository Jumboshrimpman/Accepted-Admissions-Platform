import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientIntakeAction, ClientIntakeContext, ClientIntakeModal } from "./client-intake-modal";
import { emptyIntakeDraft, type ClientIntakeDraft } from "@/lib/client-intake";

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

function advance(steps: number) {
  for (let step = 0; step < steps; step += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
}

describe("client intake modal", () => {
  it("closes without submitting and submits from the focus step", () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn(async () => undefined);
    render(
      <ClientIntakeModal open draft={ready} onDraft={vi.fn()} onClose={onClose} onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
    advance(4);
    expect(screen.getByRole("button", { name: "Submit intake" }).hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
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
    advance(4);
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
    render(
      <ClientIntakeModal
        open
        draft={ready}
        onDraft={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[100dvh]");
    expect(dialog.className).toContain("w-full");
  });

  it("keeps an action item while the intake is open and unfinished", () => {
    const openIntake = vi.fn();
    const { rerender } = render(
      <ClientIntakeContext.Provider value={{ status: { assigned: true, completed: false }, openIntake }}>
        <ClientIntakeAction />
      </ClientIntakeContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start intake" }));
    expect(openIntake).toHaveBeenCalledOnce();
    rerender(
      <ClientIntakeContext.Provider value={{ status: { assigned: true, completed: true }, openIntake }}>
        <ClientIntakeAction />
      </ClientIntakeContext.Provider>,
    );
    expect(screen.queryByTestId("client-intake-action")).toBeNull();
  });
});
