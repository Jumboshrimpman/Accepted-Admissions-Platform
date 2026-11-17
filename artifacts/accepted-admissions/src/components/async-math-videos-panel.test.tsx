import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AsyncMathVideosPanel, VideoPlayer } from "./async-math-videos-panel";

const fetchMock = vi.fn();

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function respond(body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
}

const rules = { minQuestions: 3, maxQuestions: 10, recommendedCredits: 15, turnaroundHours: 48 };
const video = {
  videoId: "dQw4w9WgXcQ",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
  thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
};

describe("AsyncMathVideosPanel", () => {
  test("renders nothing while the feature is off", async () => {
    respond({ enabled: false });
    const { container } = render(<AsyncMathVideosPanel mode="student" />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/math-videos"));
    expect(container.innerHTML).toBe("");
  });

  test("student sees Sama's How it works copy, credits, and a delivered video with its quiz", async () => {
    respond({
      enabled: true,
      audience: "student",
      rules,
      uploadsConfigured: true,
      offer: { open: true, endsAt: "2026-12-06T05:00:00.000Z" },
      credits: 12,
      draft: null,
      requests: [
        {
          id: "r1",
          status: "delivered",
          items: [{ index: 0, text: "Q18", files: [] }],
          orphanFiles: [],
          questionCount: 3,
          createdAt: "2026-11-18T12:00:00Z",
          submittedAt: "2026-11-18T12:00:00Z",
          dueAt: "2026-11-20T12:00:00Z",
          overdue: false,
          deliveredAt: "2026-11-19T12:00:00Z",
          tutorName: "Xavier Morales",
          video,
          followUpQuiz: { assignmentId: "a1", title: "Follow-up quiz", status: "published", href: "/portal/assignments/a1" },
          tutorNote: null,
        },
      ],
    });
    render(<AsyncMathVideosPanel mode="student" />);
    expect(await screen.findByText("SAT Math Video Explanations")).toBeTruthy();
    expect(screen.getByTestId("math-video-credits").textContent).toContain("12 question credits left");
    expect(screen.getByText(/Upload 3–10 SAT Math questions or concepts through the portal/)).toBeTruthy();
    expect(screen.getByText(/Within 48 hours of your submission, Xavier will upload your video explanation/)).toBeTruthy();
    expect(screen.getByText(/start with 15 question credits \(1 credit = 1 question\)/)).toBeTruthy();
    expect(screen.getByText(/minimum of 3 and a maximum of 10/)).toBeTruthy();
    expect(screen.getByTestId("math-video-open-dQw4w9WgXcQ").getAttribute("href")).toBe(video.url);
    expect(screen.getByTestId("math-video-quiz-r1").getAttribute("href")).toBe("/portal/assignments/a1");
    expect(screen.getByTestId("math-video-start")).toBeTruthy();
  });
});

describe("VideoPlayer", () => {
  test("shows a thumbnail and only loads the nocookie iframe after a click", () => {
    const { container } = render(<VideoPlayer video={video} title="Explanation" />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByTestId("math-video-play-dQw4w9WgXcQ"));
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(`${video.embedUrl}&autoplay=1`);
  });
});
