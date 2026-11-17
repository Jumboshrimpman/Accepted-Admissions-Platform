import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CurriculumBlockView } from "./curriculum-block-view";
import { formatCountdown, readIeltsSpeakingConfig } from "./ielts-speaking-block";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const config = {
  format: "ielts_speaking",
  title: "IELTS Speaking — Nov 20",
  driveFolderUrl: "https://drive.google.com/drive/folders/abc123",
  driveFolderName: "2026-11-20 Speaking",
  listeningAssignmentId: "4b0b7f6e-0c2a-4d7e-9a51-2d8c1f3e6a10",
  listeningTitle: "IELTS Listening Test (40Q)",
  part1: [{ topic: "Maps", questions: ["Do you prefer paper maps or phone maps?"] }],
  part2: {
    task: "Describe a time when you changed your mind about something important.",
    bullets: ["what it was", "what you thought before"],
    finalLine: "and explain why you changed your mind.",
    followUp: ["Do you change your mind easily?"],
  },
  part3: { theme: "Persuasion", questions: ["Why do some people never change their opinions?"] },
  rubric: [
    { criterion: "Fluency & Coherence", listenFor: ["extends answers"], strong: "s", developing: "d", needsWork: "n" },
    { criterion: "Pronunciation", listenFor: ["word stress"], strong: "s", developing: "d", needsWork: "n" },
  ],
};

function block(visibility = "both") {
  return {
    id: "b1",
    sessionId: "s1",
    kind: "strategy",
    position: 1,
    visibility,
    status: "published",
    config,
  } as never;
}

describe("IELTS Speaking block", () => {
  it("reads only ielts_speaking configs and drops unsafe links", () => {
    expect(readIeltsSpeakingConfig({ libraryKind: "x" })).toBeNull();
    const parsed = readIeltsSpeakingConfig({ ...config, driveFolderUrl: "https://evil.example/x" });
    expect(parsed?.driveFolderUrl).toBe("");
    expect(parsed?.part2?.prepSeconds).toBe(60);
    expect(parsed?.part2?.speakSeconds).toBe(120);
    expect(formatCountdown(119.2)).toBe("2:00");
    expect(formatCountdown(59)).toBe("0:59");
  });

  it("shows tutors the cue card, Drive folder and rubric without a band score", () => {
    render(<CurriculumBlockView block={block()} />);
    expect(screen.getByText(/changed your mind about something important/)).toBeTruthy();
    expect(screen.getByTestId("ielts-speaking-rubric").textContent).toContain("Fluency & Coherence");
    expect(screen.getByTestId("ielts-speaking-rubric").textContent).toContain("not an official IELTS band score");
    expect(screen.getByTestId("ielts-speaking-drive-link").getAttribute("href")).toBe(config.driveFolderUrl);
    expect(screen.getByTestId("ielts-listening-link").getAttribute("href")).toBe(
      `/portal/assignments/${config.listeningAssignmentId}`,
    );
  });

  it("hides the rubric and cue card from students until they start", () => {
    render(<CurriculumBlockView block={block()} studentFacing />);
    expect(screen.queryByTestId("ielts-speaking-rubric")).toBeNull();
    expect(screen.getByTestId("ielts-cue-card-hidden")).toBeTruthy();
    expect(screen.queryByText(/changed your mind about something important/)).toBeNull();
  });

  it("runs 1 minute of preparation, then 2 minutes of speaking", () => {
    vi.useFakeTimers();
    render(<CurriculumBlockView block={block()} studentFacing />);
    fireEvent.click(screen.getByRole("button", { name: /start 1-minute preparation/i }));
    expect(screen.getByText(/changed your mind about something important/)).toBeTruthy();
    expect(screen.getByTestId("ielts-cue-card-timer").textContent).toContain("1:00 prep");
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByTestId("ielts-cue-card-timer").textContent).toContain("0:30 prep");
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.getByTestId("ielts-cue-card-timer").textContent).toMatch(/[12]:\d\d speaking/);
    act(() => {
      vi.advanceTimersByTime(121_000);
    });
    expect(screen.getByTestId("ielts-cue-card-timer").textContent).toContain("Time is up");
    expect(screen.getByText("Do you change your mind easily?")).toBeTruthy();
  });
});
