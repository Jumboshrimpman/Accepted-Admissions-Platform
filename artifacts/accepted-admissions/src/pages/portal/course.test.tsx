import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const course = {
  id: "course-1",
  title: "Fall 2026 SAT",
  subject: "SAT",
  term: "Fall 2026",
  status: "active",
  meetUrl: "https://meet.google.com/sat-room",
  driveUrl: "https://drive.google.com/drive/folders/legacy",
  goalSummary: "Build SAT readiness.",
  sessions: [
    {
      id: "session-1",
      title: "Taito SAT with Eunice",
      subject: "SAT",
      status: "published",
      dateTime: "2026-10-02T16:00:00.000Z",
      timezone: "America/New_York",
      durationMinutes: 60,
      hasHomework: true,
      meetingUrl: "https://meet.google.com/sat-room",
      calendarEventUrl: null,
      tutor: { id: "tutor-1", name: "Eunice Chon" },
    },
    {
      id: "session-cancelled",
      title: "Cancelled SAT with Eunice",
      subject: "SAT",
      status: "published",
      dateTime: "2026-10-09T16:00:00.000Z",
      timezone: "America/New_York",
      durationMinutes: 60,
      bookingStatus: "cancelled",
      hasHomework: true,
      meetingUrl: null,
      calendarEventUrl: null,
      tutor: { id: "tutor-1", name: "Eunice Chon" },
    },
    {
      id: "1cc3dea5-9532-4dc2-9cea-3d1e5d65d119",
      title: "Taito’s SAT Session with Eunice",
      subject: "SAT",
      status: "published",
      dateTime: "2026-10-02T12:00:00.000Z",
      timezone: "Asia/Tokyo",
      durationMinutes: 60,
      bookingStatus: "confirmed",
      hasHomework: true,
      meetingUrl: "https://meet.google.com/sat-room",
      calendarEventUrl: null,
      tutor: { id: "tutor-1", name: "Eunice Chon" },
    },
  ],
};

vi.mock("@workspace/api-client-react", () => ({
  getGetCourseQueryKey: (id: string) => ["/api/courses", id],
  useGetCourse: () => ({ data: course, isLoading: false, error: null }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useParams: () => ({ courseId: "course-1" }),
}));

import PortalCourse from "./course";

afterEach(() => {
  cleanup();
});

describe("student course page", () => {
  test("does not offer a Course Drive CTA even when driveUrl is present", () => {
    render(<PortalCourse />);

    const hrefs = screen.queryAllByRole("link").map((link) => link.getAttribute("href") ?? "");
    expect(hrefs).toContain("https://meet.google.com/sat-room");
    expect(screen.queryByText(/Course Drive/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /Course Drive/i })).toBeNull();
    expect(hrefs.some((href) => /drive\.google\.com/i.test(href))).toBe(false);
  });

  test("does not render cancelled sessions as clickable cards", () => {
    render(<PortalCourse />);
    expect(screen.getByText("Taito SAT with Eunice")).toBeTruthy();
    expect(screen.queryByText("Cancelled SAT with Eunice")).toBeNull();
    const hrefs = screen.queryAllByRole("link").map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.includes("session-cancelled"))).toBe(false);
  });

  test("shows the Oct 2 Tokyo meeting as 9:00 PM JST instead of 8:00 AM", () => {
    render(<PortalCourse />);
    expect(screen.getByText("Taito’s SAT Session with Eunice")).toBeTruthy();
    expect(screen.getByText(/9:00–10:00 PM JST/)).toBeTruthy();
    expect(screen.queryByText(/8:00\s*AM/)).toBeNull();
  });
});
