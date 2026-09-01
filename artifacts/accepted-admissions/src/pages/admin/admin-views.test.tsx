import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  overview: {
    audit: [],
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
    clients: [],
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

import AdminDashboard from "./dashboard";

afterEach(() => cleanup());

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
});