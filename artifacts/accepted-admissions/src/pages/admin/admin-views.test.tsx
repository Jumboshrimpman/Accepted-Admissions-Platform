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
    guidanceRequests: [] as Array<{
      id: string;
      guardianName: string;
      studentName: string;
      email: string;
      phone: string;
      gradeOrGraduationYear: string;
      currentSchool: string;
      serviceRequested: string;
      currentSatTotal: string | null;
      currentReadingWriting: string | null;
      currentMath: string | null;
      targetSatScore: string | null;
      plannedTestDate: string | null;
      goals: string;
      schedulingAvailability: string;
      referralSource: string;
      consentToContact: boolean;
      privacyAcknowledged: boolean;
      sourcePage: string;
      status: string;
      assignedStaffUserId: string | null;
      followUpNotes: string | null;
      conversionStatus: string;
      createdAt: string;
    }>,
  },
  curriculum: {
    programs: [],
    sessions: [],
    assignments: [],
    blocks: [],
    questionStatus: [],
    submissions: [],
    tutors: [],
    clients: [] as Array<{
      id: string;
      name: string;
      email: string;
      assignedTutors: Array<{
        id: string;
        name: string;
        courseId: string;
        courseTitle: string;
        subject: string;
      }>;
    }>,
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
  mocks.overview.guidanceRequests = [];
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
      {
        id: "student-1",
        name: "Taito Goto",
        email: "taito@example.invalid",
        assignedTutors: [
          {
            id: "tutor-1",
            name: "Nika Raiffe",
            courseId: "course-1",
            courseTitle: "Fall 2026 SAT & IELTS",
            subject: "IELTS",
          },
        ],
      },
    ];
    render(<AdminCurriculum />);

    const previewLink = screen.getByRole("link", { name: /View client/i });
    expect(previewLink.getAttribute("href")).toBe("/admin/clients/student-1/preview");
    expect(screen.getByText("Nika Raiffe · English")).toBeTruthy();
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

  test("shows an empty guidance request state and new total", () => {
    render(<AdminDashboard />);

    expect(screen.getByTestId("empty-guidance-requests")).toBeTruthy();
    expect(screen.getByTestId("count-guidance-requests").textContent).toBe("0 total");
    expect(screen.getByTestId("count-new-guidance-requests").textContent).toBe("0 new");
  });

  test("renders expandable guidance request answers and optional fields", () => {
    mocks.overview.platform.newRequests = 1;
    mocks.overview.guidanceRequests = [{
      id: "request-1",
      guardianName: "Mika Goto",
      studentName: "Taito Goto",
      email: "mika@example.invalid",
      phone: "+1 555 0100",
      gradeOrGraduationYear: "11th grade",
      currentSchool: "Accepted Academy",
      serviceRequested: "SAT tutoring",
      currentSatTotal: null,
      currentReadingWriting: "680",
      currentMath: "700",
      targetSatScore: "1450",
      plannedTestDate: null,
      goals: "Build a consistent study plan before the fall test.",
      schedulingAvailability: "Weekday evenings and Saturday mornings.",
      referralSource: "School counselor",
      consentToContact: true,
      privacyAcknowledged: true,
      sourcePage: "/client-request",
      status: "new",
      assignedStaffUserId: null,
      followUpNotes: null,
      conversionStatus: "unqualified",
      createdAt: "2026-09-02T12:00:00.000Z",
    }];

    render(<AdminDashboard />);

    expect(screen.getByTestId("text-guidance-request-student-request-1").textContent).toBe("Taito Goto");
    expect(screen.getByTestId("count-new-guidance-requests").textContent).toBe("1 new");
    fireEvent.click(screen.getByTestId("details-guidance-request-request-1").querySelector("summary")!);
    expect(screen.getByTestId("text-guidance-request-email-request-1").textContent).toBe("mika@example.invalid");
    expect(screen.getByText("Build a consistent study plan before the fall test.")).toBeTruthy();
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
    expect(screen.getByText("Unassigned")).toBeTruthy();
  });
});
