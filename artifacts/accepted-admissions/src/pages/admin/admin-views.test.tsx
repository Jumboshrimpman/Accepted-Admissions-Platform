import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  overview: {
    audit: [],
    accessConflicts: [] as Array<{ roleCategories: string[] }>,
    loginActivity: [
      {
        id: "login-1",
        userId: "student-1",
        userName: "Taito Goto",
        userEmail: "taito@example.invalid",
        role: "student" as const,
        signedInAt: new Date("2026-09-01T12:00:00.000Z"),
      },
    ],
    platform: {
      upcomingSessions: 0,
      outstandingInvoices: 0,
      newRequests: 0,
    },
  },
  curriculum: {
    programs: [],
    sessions: [],
    assignments: [],
    blocks: [],
    questionStatus: [],
    submissions: [],
    tutors: [],
    clients: [] as Array<{ id: string; name: string; email: string }>,
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetAdminOverview: () => ({
    data: mocks.overview,
    isLoading: false,
  }),
  useGetAdminCurriculum: () => ({
    data: mocks.curriculum,
    isLoading: false,
  }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useLocation: () => ["/admin/curriculum?section=people", vi.fn()],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import AdminDashboard from "./dashboard";
import AdminCurriculum from "./curriculum";

afterEach(() => {
  cleanup();
  mocks.overview.accessConflicts = [];
});

describe("administrator overview", () => {
  test("removes attention surfaces and keeps login activity collapsed by default", () => {
    render(<AdminDashboard />);

    expect(screen.queryByText(/Attention queue|Needs attention/i)).toBeNull();
    const summary = screen.getByText("Login activity").closest("summary");
    const disclosure = summary?.parentElement as HTMLDetailsElement;

    expect(disclosure.open).toBe(false);
    expect(summary?.textContent).toContain("Latest: Taito Goto");

    fireEvent.click(summary!);
    expect(disclosure.open).toBe(true);
    expect(screen.getByText("taito@example.invalid")).toBeTruthy();
    expect(screen.getByText("student")).toBeTruthy();
  });

  test("exposes a client preview action for each student", () => {
    mocks.curriculum.clients = [
      { id: "student-1", name: "Taito Goto", email: "taito@example.invalid" },
    ];
    render(<AdminCurriculum />);

    const previewLink = screen.getByRole("link", { name: /View client/i });
    expect(previewLink.getAttribute("href")).toBe("/admin/clients/student-1/preview");
  });

  test("shows role categories and remediation when portal allowlists conflict", () => {
    mocks.overview.accessConflicts.push({
      roleCategories: ["administrator", "student"],
    });

    render(<AdminDashboard />);

    const warning = screen.getByRole("alert");
    expect(warning.textContent).toContain("Administrator, Student");
    expect(warning.textContent).toContain(
      "Remove each overlapping identity from all but one role allowlist",
    );
  });
});
