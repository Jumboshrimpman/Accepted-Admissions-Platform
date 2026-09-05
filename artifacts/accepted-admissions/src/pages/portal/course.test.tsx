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

    const meetLinks = screen.getAllByRole("link", { name: /Join Meet/i });
    expect(meetLinks.length).toBeGreaterThan(0);
    for (const link of meetLinks) {
      expect(link.getAttribute("href")).toBe("https://meet.google.com/sat-room");
    }
    expect(screen.queryByText(/Course Drive/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /Drive/i })).toBeNull();
    expect(
      screen.queryAllByRole("link").some((link) => /drive\.google\.com/i.test(link.getAttribute("href") ?? "")),
    ).toBe(false);
  });
});
