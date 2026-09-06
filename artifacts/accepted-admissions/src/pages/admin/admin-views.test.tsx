import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateGuidanceRequest: vi.fn(),
  updateNotification: vi.fn(),
  setQueryData: vi.fn(),
  overview: {
    users: [] as Array<{
      id: string;
      clerkUserId: string;
      email: string;
      displayName: string;
      role: "administrator" | "tutor" | "student" | "viewer";
      createdAt: string;
    }>,
    audit: [],
    accessConflicts: [] as Array<{ roleCategories: string[] }>,
    notifications: [] as Array<{
      id: string;
      kind: string;
      guidanceRequestId: string;
      title: string;
      message: string;
      status: "unread" | "read" | "dismissed";
      readAt: string | null;
      dismissedAt: string | null;
      createdAt: string;
    }>,
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
      outstandingInvoices: 3,
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
    libraryAssets: [],
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
  getGetAdminOverviewQueryKey: () => ["/api/admin/overview"],
  getGetAdminCurriculumQueryKey: () => ["/api/admin/curriculum"],
  getListAdminAccessGrantsQueryKey: () => ["/api/admin/access-grants"],
  useGetAdminOverview: () => ({
    data: mocks.overview,
    isLoading: false,
  }),
  useGetAdminCurriculum: () => ({
    data: mocks.curriculum,
    isLoading: false,
  }),
  useListAdminAccessGrants: () => ({
    data: { grants: [] },
    isLoading: false,
    error: null,
  }),
  useCreateAdminAccessGrant: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUpdateAdminAccessGrant: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  getListQuestionBankQueryKey: (params?: { courseId: string }) => ["/api/question-bank", params],
  getListContentSourcesQueryKey: (params?: { courseId: string }) => ["/api/content-sources", params],
  getGetAssignmentQueryKey: (id: string) => ["/api/assignments", id],
  useCreateAdminAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminSession: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminProgram: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminSession: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCurriculumBlock: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachSessionLibraryAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useListQuestionBank: () => ({ data: [], isLoading: false }),
  useListContentSources: () => ({ data: [], isLoading: false }),
  useCreateContentSource: () => ({ mutate: vi.fn(), isPending: false }),
  useGeneratePracticeQuestions: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuestionBankItem: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachQuestionToAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useGetAssignment: () => ({ data: { questions: [] }, isLoading: false, error: null }),
  getListSatBankCollectionsQueryKey: () => ["/api/admin/sat-bank/collections"],
  getListSatBankQuestionsQueryKey: () => ["/api/admin/sat-bank/questions"],
  getGetSatBankCollectionQueryKey: (id: string) => ["/api/admin/sat-bank/collections", id],
  useListSatBankCollections: () => ({ data: [], isLoading: false }),
  useListSatBankQuestions: () => ({ data: [], isLoading: false }),
  useGetSatBankCollection: () => ({ data: undefined, isLoading: false }),
  useImportSatBank: () => ({ mutate: vi.fn(), isPending: false }),
  useAssignSatBankPrework: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminGuidanceRequest: () => ({
    mutate: mocks.updateGuidanceRequest,
    isPending: false,
  }),
  useUpdateAdminNotification: () => ({
    mutate: mocks.updateNotification,
    isPending: false,
  }),
}));

vi.mock("@/lib/clone-admin-assignment", () => ({
  useCloneAdminAssignmentToSession: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
  useLocation: () => ["/admin/curriculum?section=people", vi.fn()],
  useSearch: () => "section=people",
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: mocks.setQueryData }),
}));

import AdminDashboard from "./dashboard";
import AdminCurriculum from "./curriculum";

afterEach(() => {
  cleanup();
  mocks.updateGuidanceRequest.mockReset();
  mocks.updateNotification.mockReset();
  mocks.setQueryData.mockReset();
  mocks.overview.users = [];
  mocks.overview.accessConflicts = [];
  mocks.overview.notifications = [];
  mocks.overview.guidanceRequests = [];
  mocks.curriculum.clients = [];
  mocks.overview.users = [];
});

describe("administrator overview", () => {
  test("separates active assignment alerts and supports clearing or restoring alerts", () => {
    mocks.overview.notifications = [
      {
        id: "notification-unread",
        kind: "guidance_request_assigned",
        guidanceRequestId: "request-1",
        title: "New assignment",
        message: "A new guidance request needs your attention.",
        status: "unread",
        readAt: null,
        dismissedAt: null,
        createdAt: "2026-09-01T12:00:00.000Z",
      },
      {
        id: "notification-read",
        kind: "guidance_request_assigned",
        guidanceRequestId: "request-2",
        title: "Completed assignment",
        message: "This assignment was already reviewed.",
        status: "read",
        readAt: "2026-09-01T11:00:00.000Z",
        dismissedAt: null,
        createdAt: "2026-09-01T11:00:00.000Z",
      },
    ];

    render(<AdminDashboard />);

    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prior notifications" })).toBeTruthy();
    expect(screen.getByTestId("notification-read-notification-unread")).toBeTruthy();
    expect(screen.getByTestId("notification-dismiss-notification-unread")).toBeTruthy();
    expect(screen.queryByTestId("notification-read-notification-read")).toBeNull();
    expect(screen.queryByTestId("notification-dismiss-notification-read")).toBeNull();
    expect(screen.getByTestId("notification-restore-notification-read")).toBeTruthy();

    fireEvent.click(screen.getByTestId("notification-read-notification-unread"));
    expect(mocks.updateNotification).toHaveBeenCalledWith(
      { notificationId: "notification-unread", data: { status: "read" } },
      expect.any(Object),
    );

    fireEvent.click(screen.getByTestId("notification-restore-notification-read"));
    expect(mocks.updateNotification).toHaveBeenLastCalledWith(
      { notificationId: "notification-read", data: { status: "unread" } },
      expect.any(Object),
    );
  });

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

  test("makes client portal preview obvious on overview", () => {
    mocks.curriculum.clients = [
      {
        id: "student-1",
        name: "Taito Goto",
        email: "taito@example.invalid",
        assignedTutors: [],
      },
    ];

    render(<AdminDashboard />);

    expect(screen.getByTestId("card-student-portals").textContent).toMatch(/Student portals/);
    const preview = screen.getByTestId("link-preview-client-student-1");
    expect(preview.getAttribute("href")).toBe("/admin/clients/student-1/preview");
    expect(preview.textContent).toMatch(/Preview client portal/);
    expect(screen.getByTestId("hint-michelle-provision").textContent).toMatch(/Michelle Makarem/);
    expect(screen.queryByText("Fall plan")).toBeNull();
    expect(screen.queryByRole("link", { name: /Finance/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Programs$/i })).toBeNull();
    expect(screen.queryByText(/outstanding invoice/i)).toBeNull();
  });

  test("keeps client preview when curriculum clients are missing by using overview students", () => {
    mocks.curriculum.clients = [];
    mocks.overview.users = [
      {
        id: "student-1",
        clerkUserId: "user_student",
        email: "taito@example.invalid",
        displayName: "Taito Goto",
        role: "student",
        createdAt: "2026-09-01T12:00:00.000Z",
      },
    ];

    render(<AdminDashboard />);

    const preview = screen.getByTestId("link-preview-client-student-1");
    expect(preview.getAttribute("href")).toBe("/admin/clients/student-1/preview");
    mocks.overview.users = [];
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

    expect(screen.getByText("Provision people")).toBeTruthy();
    expect(screen.getByLabelText("Provision role")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Administrator" })).toBeNull();
    expect(screen.getByRole("button", { name: /Provision access/i })).toBeTruthy();
    const previewLink = screen.getByRole("link", { name: /Preview client portal/i });
    expect(previewLink.getAttribute("href")).toBe("/admin/clients/student-1/preview");
    expect(screen.getByTestId("hint-michelle-provision").textContent).toMatch(/michaelmakarem@gmail.com/);
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

  test("edits and saves guidance request triage details", () => {
    mocks.overview.users = [
      {
        id: "administrator-1",
        clerkUserId: "clerk-administrator-1",
        email: "administrator@example.invalid",
        displayName: "Admissions Lead",
        role: "administrator",
        createdAt: "2026-09-01T12:00:00.000Z",
      },
      {
        id: "student-1",
        clerkUserId: "clerk-student-1",
        email: "student@example.invalid",
        displayName: "Student Account",
        role: "student",
        createdAt: "2026-09-01T12:00:00.000Z",
      },
    ];
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
    mocks.updateGuidanceRequest.mockImplementation((variables, options) => {
      options.onSuccess({
        ...mocks.overview.guidanceRequests[0],
        ...variables.data,
        notificationDelivery: { status: "sent" },
      });
    });

    render(<AdminDashboard />);
    fireEvent.click(screen.getByTestId("details-guidance-request-request-1").querySelector("summary")!);

    const saveButton = screen.getByTestId("save-guidance-request-request-1") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(screen.queryByRole("option", { name: "Student Account" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Request status"), { target: { value: "contacted" } });
    fireEvent.change(screen.getByLabelText("Conversion status"), { target: { value: "qualified" } });
    fireEvent.change(screen.getByLabelText("Assigned administrator"), { target: { value: "administrator-1" } });
    fireEvent.change(screen.getByLabelText("Private follow-up notes"), { target: { value: "Called guardian; follow up Friday." } });

    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    expect(mocks.updateGuidanceRequest).toHaveBeenCalledWith(
      {
        requestId: "request-1",
        data: {
          status: "contacted",
          conversionStatus: "qualified",
          assignedStaffUserId: "administrator-1",
          followUpNotes: "Called guardian; follow up Friday.",
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(mocks.setQueryData).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Triage details saved and assignment notification sent.");
  });

  test("shows a non-blocking assignment notification delivery failure", () => {
    mocks.overview.users = [{
      id: "administrator-1",
      clerkUserId: "clerk-administrator-1",
      email: "administrator@example.invalid",
      displayName: "Admissions Lead",
      role: "administrator",
      createdAt: "2026-09-01T12:00:00.000Z",
    }];
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
      currentReadingWriting: null,
      currentMath: null,
      targetSatScore: null,
      plannedTestDate: null,
      goals: "Private goal",
      schedulingAvailability: "Weekday evenings.",
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
    mocks.updateGuidanceRequest.mockImplementation((_variables, options) => {
      options.onSuccess({
        ...mocks.overview.guidanceRequests[0],
        assignedStaffUserId: "administrator-1",
        notificationDelivery: {
          status: "failed",
          error: "Assignment notification could not be delivered.",
        },
      });
    });

    render(<AdminDashboard />);
    fireEvent.click(screen.getByTestId("details-guidance-request-request-1").querySelector("summary")!);
    fireEvent.change(screen.getByLabelText("Assigned administrator"), { target: { value: "administrator-1" } });
    fireEvent.click(screen.getByTestId("save-guidance-request-request-1"));

    expect(screen.getByRole("alert").textContent).toContain("Triage details saved");
    expect(screen.getByRole("alert").textContent).toContain("could not be delivered");
  });
});
