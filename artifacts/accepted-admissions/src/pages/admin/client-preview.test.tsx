import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

function expectPaymentReceiptsLast() {
  const receipts = screen.getByTestId("portal-payment-receipts");
  expect(receipts.textContent).toContain("SAT session payment and receipts");
  expect(screen.getByTestId("portal-curriculum-section").contains(receipts)).toBe(false);
  expect(screen.getByTestId("client-dashboard").lastElementChild).toBe(receipts);
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
    expect(screen.getByTestId("financial-card-collapsed")).toBeTruthy();
    expectPaymentReceiptsLast();
    expect(screen.queryByText("Prepaid booking experience")).toBeNull();
    expect(screen.queryByText("Single SAT Session")).toBeNull();
    expect(screen.queryByText(/Google Calendar is disconnected/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Booking disabled in preview" })).toBeNull();
    expect(screen.queryByText(/Meetings for this program are already scheduled/i)).toBeNull();
    fireEvent.click(screen.getByTestId("financial-card-show-more"));
    expect(screen.getByText("Single SAT Session")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Checkout disabled in preview" }).hasAttribute("disabled")).toBe(true);
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
    expect(screen.getByTestId("financial-card-collapsed")).toBeTruthy();
    expectPaymentReceiptsLast();
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
    expectPaymentReceiptsLast();
    expect(screen.getAllByText("Taito’s SAT Session with Eunice").length).toBeGreaterThan(0);
    const roster = screen.getByTestId("client-tutor-roster");
    expect(within(roster).getAllByText("Eunice Chon")).toHaveLength(1);
    expect(within(roster).getAllByText("Nika Raiffe")).toHaveLength(1);
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
    expect(screen.queryByText("A prepaid session is booked")).toBeNull();
    expect(screen.getByText("Michelle’s SAT Session with Xavier")).toBeTruthy();
    expect(screen.queryByTestId("portal-payment-receipts")).toBeNull();
    expect(screen.queryByTestId("portal-curriculum-section")?.textContent ?? "").not.toContain(
      "SAT session payment and receipts",
    );
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