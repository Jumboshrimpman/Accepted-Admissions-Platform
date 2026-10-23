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
  getGetBillingHistoryQueryKey: () => ["billing-history"],
  useGetBillingHistory: () => ({
    data: { readOnly: true, payments: [] },
    isLoading: false,
    error: null,
  }),
}));

import AdminClientPreview from "./client-preview";

function expectPaymentReceiptsLast() {
  const receipts = screen.getByTestId("portal-payment-receipts");
  expect(receipts.textContent).toContain("SAT session payment and receipts");
  expect(screen.getByTestId("portal-curriculum-section").contains(receipts)).toBe(false);
  expect(screen.getByTestId("client-dashboard").lastElementChild).toBe(receipts);
}

function expectPaymentReceiptsHidden() {
  expect(screen.queryByTestId("portal-payment-receipts")).toBeNull();
  expect(screen.queryByTestId("financial-card-collapsed")).toBeNull();
  expect(screen.queryByText("SAT session payment and receipts")).toBeNull();
  expect(screen.queryByText("Your SAT session payment")).toBeNull();
  expect(screen.queryByText("Show payment details")).toBeNull();
}

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
    expectPaymentReceiptsHidden();
    expect(screen.queryByText("Your tutors")).toBeNull();
    expect(screen.getByTestId("client-quizzes").textContent).toContain("No quizzes are assigned yet.");
    expect(screen.getByText("Twelve-session roadmap")).toBeTruthy();
    expect(screen.queryByText("Prepaid booking experience")).toBeNull();
    expect(screen.queryByText("Single SAT Session")).toBeNull();
    expect(screen.queryByText(/Google Calendar is disconnected/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Booking disabled in preview" })).toBeNull();
    expect(screen.queryByText(/Meetings for this program are already scheduled/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Checkout disabled in preview" })).toBeNull();
    expect(screen.queryByText("Cancelled")).toBeNull();
    expect(screen.queryByText("Taito’s SAT Session with Xavier")).toBeNull();
    expect(screen.queryByText("No prepaid sessions reserved yet.")).toBeNull();
    expect(screen.queryByText(/\$65/)).toBeNull();
    expect(screen.queryByText("No verified purchase yet")).toBeNull();
    expect(screen.queryByText(/booking remains unavailable/i)).toBeNull();
    expect(screen.queryByText("A prepaid session is booked")).toBeNull();
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
    expectPaymentReceiptsHidden();
    expect(screen.queryByText("Prepaid booking experience")).toBeNull();
    expect(screen.queryByText(/Meetings for this program are already scheduled/i)).toBeNull();
    expect(screen.queryByText("A prepaid session is booked")).toBeNull();
    expect(screen.queryByText(/Booked, rescheduled, and cancelled sessions are listed below/i)).toBeNull();
  });

  test("hides the prepaid booking experience for an off-platform client with live sessions", () => {
    mocks.preview = {
      user: {
        id: "student-1",
        displayName: "Taito Goto",
        email: "taito0525@gmail.com",
        role: "student",
        avatarUrl: null,
      },
      welcomeMessage: "Your Fall program is ready.",
      courses: [
        {
          id: "course-1",
          title: "Fall 2026 SAT & IELTS",
          subject: "SAT & IELTS",
          term: "Fall 2026",
          status: "active",
          sessionCount: 2,
          completedSessionCount: 0,
          tutors: [
            { id: "eunice", name: "Eunice Chon", specialty: "SAT Tutor", avatarUrl: null },
            { id: "nika", name: "Nika Raiffe", specialty: "English Tutor", avatarUrl: null },
          ],
        },
      ],
      upcomingSessions: [
        {
          id: "session-1",
          courseId: "course-1",
          tutorProfileId: "tutor-1",
          tutorName: "Eunice Chon",
          dateTime: "2026-10-02T12:00:00.000Z",
          timezone: "America/New_York",
          subject: "SAT",
          title: "Taito’s SAT Session with Eunice",
          durationMinutes: 60,
          bookingStatus: "confirmed",
          meetingUrl: "https://meet.google.com/rih-iayt-okb",
          tutor: { id: "tutor", name: "Eunice Chon", specialty: "SAT Tutor", avatarUrl: null },
          student: { id: "student-1", name: "Taito Goto" },
        },
        {
          id: "session-2",
          courseId: "course-1",
          tutorProfileId: "tutor-2",
          tutorName: "Nika Raiffe",
          dateTime: "2026-10-23T12:00:00.000Z",
          timezone: "America/New_York",
          subject: "IELTS",
          title: "Taito’s English Session with Nika",
          durationMinutes: 60,
          bookingStatus: "confirmed",
          meetingUrl: "https://meet.google.com/ielts-room",
          tutor: { id: "tutor-2", name: "Nika Raiffe", specialty: "IELTS Tutor", avatarUrl: null },
          student: { id: "student-1", name: "Taito Goto" },
        },
      ],
      curriculumSessions: [
        {
          id: "session-1",
          courseId: "course-1",
          tutorProfileId: "tutor-1",
          tutorName: "Eunice Chon",
          dateTime: "2026-10-02T12:00:00.000Z",
          timezone: "America/New_York",
          subject: "SAT",
          title: "Taito’s SAT Session with Eunice",
          durationMinutes: 60,
          bookingStatus: "confirmed",
          meetingUrl: "https://meet.google.com/rih-iayt-okb",
          tutor: { id: "tutor", name: "Eunice Chon", specialty: "SAT Tutor", avatarUrl: null },
          student: { id: "student-1", name: "Taito Goto" },
          readiness: "ready",
          nextAction: "Open session plan",
          currentFocus: "SAT reasoning.",
          preparation: null,
          latestResult: null,
        },
        {
          id: "session-2",
          courseId: "course-1",
          tutorProfileId: "tutor-2",
          tutorName: "Nika Raiffe",
          dateTime: "2026-10-23T12:00:00.000Z",
          timezone: "America/New_York",
          subject: "IELTS",
          title: "Taito’s English Session with Nika",
          durationMinutes: 60,
          bookingStatus: "confirmed",
          meetingUrl: "https://meet.google.com/ielts-room",
          tutor: { id: "tutor-2", name: "Nika Raiffe", specialty: "IELTS Tutor", avatarUrl: null },
          student: { id: "student-1", name: "Taito Goto" },
          readiness: "ready",
          nextAction: "Open session plan",
          currentFocus: "English communication.",
          preparation: null,
          latestResult: null,
        },
      ],
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
        sessions: [
          {
            id: "session-1",
            courseId: "course-1",
            tutorProfileId: "tutor-1",
            tutorName: "Eunice Chon",
            dateTime: "2026-10-02T12:00:00.000Z",
            timezone: "America/New_York",
            subject: "SAT",
            title: "Taito’s SAT Session with Eunice",
            durationMinutes: 60,
            bookingStatus: "confirmed",
            meetingUrl: "https://meet.google.com/rih-iayt-okb",
          },
        ],
      },
    };

    render(<AdminClientPreview />);

    expect(screen.queryByText("Prepaid booking experience")).toBeNull();
    expect(screen.queryByText("A prepaid session is booked")).toBeNull();
    expect(screen.queryByText(/Booked, rescheduled, and cancelled sessions are listed below/i)).toBeNull();
    expect(screen.queryByText("No prepaid hour is currently available")).toBeNull();
    expect(screen.queryByText("Payment verified — ready to book")).toBeNull();
    expect(screen.queryByText(/Google Calendar is disconnected/)).toBeNull();
    expect(screen.queryByText(/Meetings for this program are already scheduled/i)).toBeNull();
    expectPaymentReceiptsHidden();
    expect(screen.getAllByText("Taito’s SAT Session with Eunice").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("client-tutor-roster")).toBeNull();
    expect(screen.queryByText("Your tutors")).toBeNull();
  });

  test("self-serve clients see prepaid booking without the booked banner when a session is reserved", () => {
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
        purchasedHours: 1,
        usedHours: 1,
        remainingHours: 0,
        readOnly: true,
        selfServeSatBooking: true,
        twelveSessionPlan: false,
      },
      progress: {
        totalSessions: 1,
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
        purchasedHours: 1,
        usedHours: 1,
        remainingHours: 0,
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
        calendarStatus: "connected",
        availability: null,
        sessions: [
          {
            id: "session-michelle",
            courseId: "course-1",
            tutorProfileId: "tutor-1",
            tutorName: "Xavier Morales",
            dateTime: "2026-10-09T16:00:00.000Z",
            timezone: "America/New_York",
            subject: "SAT",
            title: "Michelle’s SAT Session with Xavier",
            durationMinutes: 60,
            bookingStatus: "confirmed",
            meetingUrl: "https://meet.google.com/example",
          },
        ],
      },
    };

    render(<AdminClientPreview />);

    expect(screen.getByText("Prepaid booking experience")).toBeTruthy();
    expect(screen.getByTestId("client-dashboard").textContent).toContain("Prepaid booking experience");
    expect(screen.queryByText("A prepaid session is booked")).toBeNull();
    expect(screen.getByText("Michelle’s SAT Session with Xavier")).toBeTruthy();
    expectPaymentReceiptsLast();
    expect(screen.queryByText("Your tutors")).toBeNull();
    expect(screen.getByTestId("client-quizzes").textContent).toContain("No quizzes are assigned yet.");
    expect(screen.getByText("Session roadmap")).toBeTruthy();
    expect(screen.queryByText("One plan. Twelve focused meetings.")).toBeNull();
    expect(screen.queryByText("Eunice Chon")).toBeNull();
    expect(screen.queryByText("Nika Raiffe")).toBeNull();
  });

  test("self-serve prepaid booked sessions show the next upcoming and hide the rest", () => {
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
        purchasedHours: 3,
        usedHours: 3,
        remainingHours: 0,
        readOnly: true,
        selfServeSatBooking: true,
        twelveSessionPlan: false,
      },
      progress: {
        totalSessions: 3,
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
        purchasedHours: 3,
        usedHours: 3,
        remainingHours: 0,
        invoices: [],
        payments: [
          {
            id: "payment-1",
            amountCents: 39000,
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
        calendarStatus: "connected",
        availability: null,
        sessions: [
          {
            id: "session-later",
            courseId: "course-1",
            tutorProfileId: "tutor-1",
            tutorName: "Xavier Morales",
            dateTime: "2026-10-23T16:00:00.000Z",
            timezone: "America/New_York",
            subject: "SAT",
            title: "Michelle later SAT session",
            durationMinutes: 60,
            bookingStatus: "confirmed",
            meetingUrl: "https://meet.google.com/later",
          },
          {
            id: "session-next",
            courseId: "course-1",
            tutorProfileId: "tutor-1",
            tutorName: "Xavier Morales",
            dateTime: "2026-10-09T16:00:00.000Z",
            timezone: "America/New_York",
            subject: "SAT",
            title: "Michelle next SAT session",
            durationMinutes: 60,
            bookingStatus: "confirmed",
            meetingUrl: "https://meet.google.com/next",
          },
          {
            id: "session-mid",
            courseId: "course-1",
            tutorProfileId: "tutor-1",
            tutorName: "Eunice Chon",
            dateTime: "2026-10-16T16:00:00.000Z",
            timezone: "America/New_York",
            subject: "SAT",
            title: "Michelle mid SAT session",
            durationMinutes: 60,
            bookingStatus: "confirmed",
            meetingUrl: "https://meet.google.com/mid",
          },
        ],
      },
    };

    render(<AdminClientPreview />);

    expect(screen.getByText("Prepaid booking experience")).toBeTruthy();
    expect(screen.getByTestId("client-dashboard").textContent).toContain("Prepaid booking experience");
    expectPaymentReceiptsLast();
    expect(screen.queryByText("A prepaid session is booked")).toBeNull();
    expect(screen.getByText("Michelle next SAT session")).toBeTruthy();
    expect(screen.queryByText("Michelle mid SAT session")).toBeNull();
    expect(screen.queryByText("Michelle later SAT session")).toBeNull();
    expect(screen.getByTestId("prepaid-booked-sessions-show-more").textContent).toContain("Show more");

    fireEvent.click(screen.getByTestId("prepaid-booked-sessions-show-more"));
    expect(screen.getByText("Michelle mid SAT session")).toBeTruthy();
    expect(screen.getByText("Michelle later SAT session")).toBeTruthy();
    expect(screen.getByTestId("prepaid-booked-sessions-show-more").textContent).toContain("Show less");

    fireEvent.click(screen.getByTestId("prepaid-booked-sessions-show-more"));
    expect(screen.queryByText("Michelle mid SAT session")).toBeNull();
    expect(screen.queryByText("Michelle later SAT session")).toBeNull();
    expect(screen.getByTestId("prepaid-booked-sessions-show-more").textContent).toContain("Show more");
  });

  test("preview purchase offers list the active SAT catalog and assigned tutor calendar", () => {
    mocks.preview = {
      user: {
        id: "student-michelle",
        displayName: "Michelle Makarem",
        email: "michaelmakarem@gmail.com",
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
        slug: "single-sat-session",
        name: "Single SAT Session",
        description: "One prepaid 60-minute SAT tutoring credit.",
        priceCents: 13000,
        durationHours: 1,
        durationMinutes: 60,
      },
      previewOffers: [
        {
          slug: "single-sat-session",
          name: "Single SAT Session",
          description: "One prepaid 60-minute SAT tutoring credit.",
          priceCents: 13000,
          durationHours: 1,
          durationMinutes: 60,
        },
        {
          slug: "ten-sat-session-package",
          name: "Ten SAT Session Package",
          description: "Ten prepaid 60-minute SAT tutoring credits at $130/hour.",
          priceCents: 130000,
          durationHours: 10,
          durationMinutes: 60,
        },
      ],
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
        calendarStatus: "connected",
        availability: {
          tutor: {
            id: "xavier-profile",
            name: "Xavier Morales",
            title: "SAT Tutor",
            timezone: "America/New_York",
          },
          providerStatus: "connected",
          slots: ["2026-09-14T15:00:00.000Z"],
        },
        sessions: [],
      },
    };

    render(<AdminClientPreview />);

    expect(screen.getByText("Single SAT Session")).toBeTruthy();
    expect(screen.getByText("Ten SAT Session Package")).toBeTruthy();
    expect(screen.getByText("$130.00")).toBeTruthy();
    expect(screen.getByText("$1300.00")).toBeTruthy();
    expect(screen.getByText("Available times with Xavier Morales")).toBeTruthy();
    expect(screen.getByText("Calendar connected")).toBeTruthy();
    expect(screen.queryByText("Eunice Chon")).toBeNull();
    const dashboard = screen.getByTestId("client-dashboard");
    const text = dashboard.textContent ?? "";
    expect(text).toContain("0 credits remaining");
    expect(text.indexOf("Welcome back, Michelle.")).toBeLessThan(text.indexOf("0 credits remaining"));
    expect(text.indexOf("SAT session payment and receipts")).toBeLessThan(text.indexOf("Billing history"));
    expect(dashboard.lastElementChild).toBe(screen.getByTestId("billing-history"));
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
        availability: {
          tutor: {
            id: "xavier-profile",
            name: "Xavier Morales",
            title: "SAT Tutor",
            timezone: "America/New_York",
          },
          providerStatus: "disconnected",
          slots: [],
        },
        sessions: [],
      },
    };

    render(<AdminClientPreview />);

    expect(screen.getByText(/Xavier Morales/)).toBeTruthy();
    expect(screen.getByText(/Google Calendar is disconnected/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Booking disabled in preview" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByTestId("financial-card-collapsed")).toBeNull();
    expectPaymentReceiptsLast();
  });

  test("empty self-serve clients use the same dashboard construction without Taito data", () => {
    mocks.preview = {
      user: {
        id: "student-3",
        displayName: "Jordan Lee",
        email: "jordan@example.invalid",
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

    expect(screen.getByText("Welcome back, Jordan.")).toBeTruthy();
    expect(screen.queryByText("Your tutors")).toBeNull();
    expect(
      screen.queryByText("Your tutor relationships will appear here once the matching tutor account is provisioned."),
    ).toBeNull();
    expect(screen.getByTestId("client-quizzes").textContent).toContain("No quizzes are assigned yet.");
    expect(screen.getByText("Your sessions will appear here when they are scheduled.")).toBeTruthy();
    expect(screen.getByText("Session roadmap")).toBeTruthy();
    expect(screen.getByText("No sessions are visible for this account.")).toBeTruthy();
    expect(screen.getByText("Prepaid booking experience")).toBeTruthy();
    expect(screen.queryByText("One plan. Twelve focused meetings.")).toBeNull();
    expect(screen.queryByText("Fall 2026 curriculum")).toBeNull();
    expect(screen.queryByText("Twelve-session roadmap")).toBeNull();
    expect(screen.queryByText("Eunice Chon")).toBeNull();
    expect(screen.queryByText("Nika Raiffe")).toBeNull();
    expect(screen.queryByText(/Taito/i)).toBeNull();
    expectPaymentReceiptsLast();
  });

  test("previews Neel's College Consulting portal without booking or checkout", () => {
    mocks.preview = {
      user: {
        id: "6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19",
        displayName: "Neel Dharni",
        email: "samakubba@gmail.com",
        role: "student",
        avatarUrl: null,
      },
      courses: [],
      upcomingSessions: [
        {
          id: "session-nika",
          courseId: "course-consulting",
          dateTime: "2026-11-02T15:00:00.000Z",
          timezone: "America/New_York",
          durationMinutes: 60,
          subject: "College Consulting",
          title: "Neel with Nika",
          status: "published",
          tutor: { id: "tutor-nika", name: "Nika Raiffe", specialty: "College Consulting" },
        },
      ],
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
        selfServeCollegeConsulting: true,
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
        name: "College Consulting hour with Nika Raiffe",
        description: "One prepaid hour.",
        priceCents: 13000,
        durationMinutes: 60,
      },
      previewOffers: [],
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
      previewBooking: { calendarStatus: "unavailable", availability: null, sessions: [] },
      previewConsultingTutors: [
        {
          tutorKey: "nika",
          id: "preview-nika",
          name: "Nika Raiffe",
          title: "College Consulting Tutor",
          tagline: "Columbia & Sciences Po dual degree, Political Science, Law & Psychology; Goldman Sachs BI",
          biography: "Nika biography for the preview.",
          photoUrl: "/media/team/nika-raiffe.png",
          hourlyRateCents: 10000,
          prepaidHours: 1,
          calendarConnected: true,
        },
        {
          tutorKey: "victoria",
          id: "preview-victoria",
          name: "Victoria Wijerathnayapa",
          title: "College Consulting Tutor",
          tagline: "Harvard Neuroscience & Education '25, Instructional Design, Youth Mentor",
          biography: "Victoria biography for the preview.",
          photoUrl: "/media/team/victoria.jpg",
          hourlyRateCents: 13000,
          prepaidHours: 0,
          calendarConnected: false,
        },
        {
          tutorKey: "xavier",
          id: "preview-xavier",
          name: "Xavier Morales",
          title: "College Consulting Tutor",
          tagline: "Harvard Math, Econ and CS '24, Rhodes Scholar Oxford MA Philosophy '26, Quant Finance",
          biography: "Xavier biography for the preview.",
          photoUrl: "/media/team/xavier-morales.jpg",
          hourlyRateCents: 20000,
          prepaidHours: 0,
          calendarConnected: false,
        },
      ],
    };

    render(<AdminClientPreview />);

    const consultingDashboard = screen.getByTestId("consulting-preview-dashboard");
    const sectionText = consultingDashboard.textContent ?? "";
    expect(consultingDashboard.firstElementChild).toBe(screen.getByTestId("consulting-preview-welcome"));
    expect(sectionText.indexOf("Welcome back, Neel.")).toBeLessThan(sectionText.indexOf("Upcoming sessions"));
    expect(sectionText.indexOf("Upcoming sessions")).toBeLessThan(sectionText.indexOf("1 Nika hour credits remaining"));
    expect(sectionText.indexOf("1 Nika hour credits remaining")).toBeLessThan(sectionText.indexOf("Read-only College Consulting preview"));
    expect(sectionText.indexOf("Read-only College Consulting preview")).toBeLessThan(sectionText.indexOf("Tutors"));
    expect(sectionText.indexOf("Tutors")).toBeLessThan(sectionText.indexOf("Billing history"));
    expect(consultingDashboard.lastElementChild).toBe(screen.getByTestId("billing-history"));
    const credits = screen.getByTestId("consulting-preview-credits") as HTMLDetailsElement;
    expect(credits.open).toBe(false);
    expect(credits.textContent).toContain("1 Nika hour credits remaining");
    const billing = screen.getByTestId("billing-history") as HTMLDetailsElement;
    expect(billing.open).toBe(false);
    expect(billing.textContent).toContain("Billing history (0 payments)");
    fireEvent.click(billing.querySelector("summary")!);
    expect(billing.open).toBe(true);
    expect(screen.getByTestId("billing-history-empty").textContent).toContain(
      "No payments or purchases are on file.",
    );
    expect(sectionText).toContain("Welcome back, Neel.");
    expect(screen.queryByText(/Each tutor keeps their own hours/i)).toBeNull();
    expect(screen.queryByText(/Hours do not transfer between tutors/i)).toBeNull();
    expect(screen.queryByText(/Nika is \$100\/hour/)).toBeNull();
    expect(screen.getByTestId("consulting-preview-tutor-nika").textContent).toContain("Nika");
    expect(screen.getByTestId("consulting-preview-tutor-nika").textContent).not.toContain("Nika Raiffe");
    expect(screen.getByTestId("consulting-preview-tutor-nika").textContent).toContain("$100/hr");
    expect(screen.getByTestId("consulting-preview-tutor-victoria").textContent).toContain("Victoria");
    expect(screen.getByTestId("consulting-preview-tutor-victoria").textContent).not.toContain("Wijerathnayapa");
    expect(screen.getByTestId("consulting-preview-credit-nika").textContent).toContain("$100/hr");
    const victoriaPhoto = screen.getByTestId("consulting-preview-tutor-victoria").querySelector("img");
    expect(victoriaPhoto?.className).toContain("object-center");
    expect(screen.getByTestId("consulting-preview-tutor-xavier").textContent).toContain("$200/hr");
    expect(screen.getByTestId("consulting-preview-credit-nika").textContent).toContain("1");
    expect(screen.getByTestId("consulting-preview-credit-victoria").textContent).toContain("No prepaid hours yet");
    expect(screen.getByTestId("consulting-preview-session-session-nika").textContent).toContain("Neel with Nika");
    expect(screen.queryByTestId("consulting-preview-bio-text-nika")).toBeNull();
    fireEvent.click(screen.getByTestId("consulting-preview-bio-nika"));
    expect(screen.getByTestId("consulting-preview-bio-text-nika").textContent).toContain("Nika biography");
    fireEvent.click(screen.getByTestId("consulting-preview-bio-nika"));
    expect(screen.queryByTestId("consulting-preview-bio-text-nika")).toBeNull();
    expect(screen.queryByTestId("portal-curriculum-section")).toBeNull();
    expect(screen.queryByTestId("client-quizzes")).toBeNull();
    expect(screen.queryByText("Twelve-session roadmap")).toBeNull();
    expect(screen.queryByText("Session roadmap")).toBeNull();
    expect(screen.queryByTestId("portal-payment-receipts")).toBeNull();
    expect(screen.queryByText(/Stripe/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /Purchase|Checkout|Buy /i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Reserve|Book a/i })).toBeNull();
    expect(screen.getByTestId("consulting-preview-readonly").textContent).toContain("Booking, checkout, and email stay off");
  });
});