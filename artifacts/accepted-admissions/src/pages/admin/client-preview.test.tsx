import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: null as Record<string, unknown> | null,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useParams: () => ({ clientId: "student-1" }),
  useLocation: () => ["/admin/clients/student-1", vi.fn()],
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetAdminClientDashboardQueryKey: (clientId: string) => ["preview", clientId],
  getGetFinancialsQueryKey: () => ["financials"],
  useGetAdminClientDashboard: () => ({
    data: mocks.preview,
    isLoading: false,
    error: null,
  }),
  useGetFinancials: () => ({
    data: null,
    isLoading: false,
  }),
}));

import AdminClientPreview from "./client-preview";

afterEach(() => cleanup());

describe("administrator client preview", () => {
  test("identifies the student and keeps payment and booking actions read-only", () => {
    mocks.preview = {
      user: {
        id: "student-1",
        displayName: "Taito Goto",
        email: "taito@example.invalid",
        role: "student",
        avatarUrl: null,
      },
      welcomeMessage: "Your Fall program is ready.",
      courses: [],
      upcomingSessions: [],
      curriculumSessions: [],
      assignments: [],
      recentScores: [],
      reviewSkills: [],
      credits: { purchasedHours: 1, usedHours: 0, remainingHours: 1, readOnly: true, selfServeSatBooking: false, twelveSessionPlan: true },
      progress: {
        totalSessions: 0,
        completedSessions: 0,
        averageScore: null,
        strengths: [],
        weaknesses: [],
      },
      assignedStudents: [],
      newSubmissions: [],
      openReviewCount: 0,
      adminPreview: true,
      previewOffer: {
        name: "Single SAT Session",
        description:
          "One prepaid 60-minute SAT tutoring credit. Book any open hour with our SAT tutors.",
        priceCents: 13000,
        durationMinutes: 60,
      },
      previewFinancials: {
        readOnly: true,
        providerStatus: "connected",
        purchasedHours: 1,
        usedHours: 0,
        remainingHours: 1,
        invoices: [],
        payments: [
          {
            id: "payment-1",
            amountCents: 13000,
            refundedAmountCents: 0,
            status: "paid",
            method: "stripe",
            receiptUrl: "https://example.invalid/receipt",
            verifiedAt: "2026-09-01T12:00:00.000Z",
            createdAt: "2026-09-01T12:00:00.000Z",
          },
        ],
        credits: [],
      },
      previewBooking: {
        calendarStatus: "disconnected",
        availability: null,
        sessions: [
          {
            id: "session-1",
            courseId: "course-1",
            tutorProfileId: "tutor-1",
            tutorName: "Xavier Morales",
            dateTime: "2026-10-02T12:00:00.000Z",
            timezone: "America/New_York",
            subject: "SAT",
            title: "Taito’s SAT Session with Xavier",
            durationMinutes: 60,
            bookingStatus: "cancelled",
            meetingUrl: null,
            cancellationReason: "Student cancelled",
          },
        ],
      },
    };

    render(<AdminClientPreview />);

    expect(screen.getByText("Administrator client preview")).toBeTruthy();
    expect(screen.getByText(/Taito Goto's client-scoped data/)).toBeTruthy();
    expect(screen.getByText(/assign or remove them under People/i)).toBeTruthy();
    expect(screen.getByTestId("financial-card-collapsed")).toBeTruthy();
    expect(screen.queryByText("Single SAT Session")).toBeNull();
    expect(screen.queryByText(/Google Calendar is disconnected/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Booking disabled in preview" })).toBeNull();
    expect(
      screen.getByText(/Meetings for this program are already scheduled/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("financial-card-show-more"));
    expect(screen.getByText("Single SAT Session")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Checkout disabled in preview" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("Cancelled")).toBeNull();
    expect(screen.queryByText("Taito’s SAT Session with Xavier")).toBeNull();
    expect(screen.getByText("No prepaid sessions reserved yet.")).toBeTruthy();
    expect(screen.queryByText(/\$65/)).toBeNull();
    expect(screen.queryByText("No verified purchase yet")).toBeNull();
    expect(screen.queryByText(/booking remains unavailable/i)).toBeNull();
  });

  test("does not show the unpaid purchase banner for an off-platform client", () => {
    mocks.preview = {
      user: {
        id: "student-1",
        displayName: "Taito Goto",
        email: "taito0525@gmail.com",
        role: "student",
        avatarUrl: null,
      },
      welcomeMessage: "Your Fall program is ready.",
      courses: [],
      upcomingSessions: [],
      curriculumSessions: [],
      assignments: [],
      recentScores: [],
      reviewSkills: [],
      credits: {
        purchasedHours: 0,
        usedHours: 0,
        remainingHours: 0,
        readOnly: true,
        selfServeSatBooking: false,
        twelveSessionPlan: true,
      },
      progress: {
        totalSessions: 12,
        completedSessions: 0,
        averageScore: null,
        strengths: [],
        weaknesses: [],
      },
      assignedStudents: [],
      newSubmissions: [],
      openReviewCount: 0,
      adminPreview: true,
      previewOffer: {
        name: "Single SAT Session",
        description: "One prepaid 60-minute SAT tutoring credit.",
        priceCents: 13000,
        durationMinutes: 60,
      },
      previewFinancials: {
        readOnly: true,
        providerStatus: "connected",
        purchasedHours: 0,
        usedHours: 0,
        remainingHours: 0,
        invoices: [],
        payments: [],
        credits: [],
      },
      previewBooking: {
        calendarStatus: "disconnected",
        availability: null,
        sessions: [],
      },
    };

    render(<AdminClientPreview />);

    expect(screen.queryByText("No verified purchase yet")).toBeNull();
    expect(
      screen.queryByText("The student has not completed a verified purchase, so booking remains unavailable."),
    ).toBeNull();
    expect(screen.queryByText("Booking unavailable until payment is verified")).toBeNull();
    expect(screen.queryByText(/must complete an SAT purchase/i)).toBeNull();
    expect(screen.queryByText(/Google Calendar is disconnected/)).toBeNull();
    expect(screen.getByTestId("financial-card-collapsed")).toBeTruthy();
    expect(
      screen.getByText(/Meetings for this program are already scheduled/i),
    ).toBeTruthy();
  });

  test("self-serve clients still see calendar-disconnect copy when no sessions exist", () => {
    mocks.preview = {
      user: {
        id: "student-2",
        displayName: "Michelle Chen",
        email: "michelle@example.invalid",
        role: "student",
        avatarUrl: null,
      },
      welcomeMessage: "Welcome back.",
      courses: [],
      upcomingSessions: [],
      curriculumSessions: [],
      assignments: [],
      recentScores: [],
      reviewSkills: [],
      credits: {
        purchasedHours: 0,
        usedHours: 0,
        remainingHours: 0,
        readOnly: true,
        selfServeSatBooking: true,
        twelveSessionPlan: false,
      },
      progress: {
        totalSessions: 0,
        completedSessions: 0,
        averageScore: null,
        strengths: [],
        weaknesses: [],
      },
      assignedStudents: [],
      newSubmissions: [],
      openReviewCount: 0,
      adminPreview: true,
      previewOffer: {
        name: "Single SAT Session",
        description: "One prepaid 60-minute SAT tutoring credit.",
        priceCents: 13000,
        durationMinutes: 60,
      },
      previewFinancials: {
        readOnly: true,
        providerStatus: "connected",
        purchasedHours: 0,
        usedHours: 0,
        remainingHours: 0,
        invoices: [],
        payments: [],
        credits: [],
      },
      previewBooking: {
        calendarStatus: "disconnected",
        availability: null,
        sessions: [],
      },
    };

    render(<AdminClientPreview />);

    expect(screen.getByText(/Google Calendar is disconnected/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Booking disabled in preview" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByTestId("financial-card-collapsed")).toBeNull();
  });
});