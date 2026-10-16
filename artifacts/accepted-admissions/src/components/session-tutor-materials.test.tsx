import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SessionTutorMaterials } from "./session-tutor-materials";

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("session tutor materials", () => {
  test("hides downloads and badges when no quiz is attached", () => {
    const view = render(
      <SessionTutorMaterials
        sessionId="session-1"
        assignments={[]}
        homework={[]}
        beforeAssignmentId=""
        duringAssignmentId=""
        duringQuestionCount={0}
      />,
    );
    expect(view.container.textContent).toBe("");
    expect(screen.queryByText(/Download/)).toBeNull();
  });

  test("shows pre-work and homework status with a review link", () => {
    render(
      <SessionTutorMaterials
        sessionId="session-1"
        timezone="America/New_York"
        assignments={[
          { id: "pre", deliveryPhase: "before_session", title: "Routine pre-work" },
          { id: "home", deliveryPhase: "during_session", title: "In-session homework" },
        ]}
        homework={[
          {
            assignmentId: "pre",
            title: "Routine pre-work",
            attemptStatus: "paused",
            score: null,
            attemptId: "attempt-pre",
          },
          {
            assignmentId: "home",
            title: "In-session homework",
            attemptStatus: null,
            score: null,
            attemptId: null,
          },
        ]}
        beforeAssignmentId="pre"
        duringAssignmentId="home"
        duringQuestionCount={4}
      />,
    );
    expect(screen.getByTestId("tutor-completion-badge-pre").textContent).toBe("Paused");
    expect(screen.getByTestId("tutor-completion-badge-home").textContent).toBe("Not started");
    expect(screen.getByTestId("tutor-completion-pre").textContent).toMatch(/Pre-work/);
    expect(screen.getByTestId("tutor-completion-home").textContent).toMatch(/Homework/);
    expect(screen.getByRole("link", { name: "Review attempt" }).getAttribute("href")).toBe(
      "/tutor/attempts/attempt-pre",
    );
    expect(screen.getByTestId("download-prework-questions")).toBeTruthy();
    expect(screen.getByTestId("download-in-session-answer-key")).toBeTruthy();
  });
});
