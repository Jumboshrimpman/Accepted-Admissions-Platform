import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, test, expect, vi } from "vitest";

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

import { AdminSessionQuizLinks } from "./admin-session-quiz-links";

afterEach(() => {
  cleanup();
});

test("lists other quiz types and the empty state", () => {
  const view = render(
    <AdminSessionQuizLinks
      assignments={[
        {
          id: "topic",
          title: "Topic homework",
          deliveryPhase: "skill_practice",
          status: "published",
          questionCount: 4,
        },
        {
          id: "after",
          title: "Geometry SAT Questions",
          deliveryPhase: "before_session",
          status: "published",
          questionCount: 8,
        },
      ]}
    />,
  );
  expect(screen.getByTestId("admin-session-quiz-other").textContent).toMatch(/Topic homework/);
  expect(screen.getByRole("link", { name: "Open quiz" }).getAttribute("href")).toBe(
    "/portal/assignments/topic",
  );
  expect(view.container.textContent).toMatch(/Geometry SAT Questions/);
  view.rerender(<AdminSessionQuizLinks assignments={[]} />);
  expect(screen.getByText("No quizzes are attached to this session yet.")).toBeTruthy();
});
