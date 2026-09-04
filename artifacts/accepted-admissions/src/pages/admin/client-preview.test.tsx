import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: null as Record<string, unknown> | null,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useParams: () => ({ clientId: "student-1" }),
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
      credits: { purchasedHours: 1, usedHours: 0, remainingHours: 1, readOnly: true },
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
        description: "One prepaid 60-minute SAT tutoring session credit.",
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
    expect(screen.getByText("Single SAT Session")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Checkout disabled in preview" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Booking disabled in preview" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Google Calendar is disconnected/)).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByText(/\$65/)).toBeNull();
  });
});