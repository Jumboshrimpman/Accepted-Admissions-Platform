import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { customFetch } from "@workspace/api-client-react";
import {
  SessionQuestionDownloads,
  SessionTutorMaterials,
  sessionOffersQuestionPdfs,
  viewerMayDownloadSessionPdfs,
} from "./session-tutor-materials";

const toast = vi.hoisted(() => vi.fn());

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast,
}));

afterEach(() => {
  cleanup();
  toast.mockReset();
  vi.mocked(customFetch).mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const assignedTutor = {
  id: "tutor-eunice",
  specialty: "Assigned tutor",
};

describe("session tutor materials", () => {
  test("hides downloads and badges when no quiz is attached", () => {
    const view = render(
      <SessionTutorMaterials
        sessionId="session-1"
        assignments={[]}
        homework={[]}
        beforeAssignmentId=""
        duringAssignmentId=""
        duringQuestionCount={0}
      />,
    );
    expect(view.container.textContent).toBe("");
    expect(screen.queryByText(/Download/)).toBeNull();
  });

  test("shows pre-work and homework status with a review link", () => {
    render(
      <SessionTutorMaterials
        sessionId="session-1"
        timezone="America/New_York"
        assignments={[
          { id: "pre", deliveryPhase: "before_session", title: "Routine pre-work" },
          { id: "home", deliveryPhase: "during_session", title: "In-session homework" },
        ]}
        homework={[
          {
            assignmentId: "pre",
            title: "Routine pre-work",
            attemptStatus: "paused",
            score: null,
            attemptId: "attempt-pre",
          },
          {
            assignmentId: "home",
            title: "In-session homework",
            attemptStatus: null,
            score: null,
            attemptId: null,
          },
        ]}
        beforeAssignmentId="pre"
        duringAssignmentId="home"
        duringQuestionCount={4}
        canDownloadPdfs
      />,
    );
    expect(screen.getByTestId("tutor-completion-badge-pre").textContent).toBe("In progress");
    expect(screen.getByTestId("tutor-completion-badge-home").textContent).toBe("Not started");
    expect(screen.getByTestId("tutor-completion-pre").textContent).toMatch(/Pre-work/);
    expect(screen.getByTestId("tutor-completion-home").textContent).toMatch(/Homework/);
    expect(screen.getByRole("link", { name: "Review attempt" }).getAttribute("href")).toBe(
      "/tutor/attempts/attempt-pre",
    );
    expect(screen.getByTestId("download-session-questions")).toBeTruthy();
    expect(screen.getByTestId("download-session-answer-key")).toBeTruthy();
    expect(screen.queryByTestId("download-prework-questions")).toBeNull();
    expect(screen.queryByTestId("download-in-session-questions")).toBeNull();
  });

  test("hides PDF buttons unless the viewer is the assigned tutor or an admin", () => {
    expect(
      viewerMayDownloadSessionPdfs({
        role: "student",
        viewerUserId: "student-1",
        sessionTutor: assignedTutor,
      }),
    ).toBe(false);
    expect(
      viewerMayDownloadSessionPdfs({
        role: "tutor",
        viewerUserId: "tutor-other",
        sessionTutor: assignedTutor,
      }),
    ).toBe(false);
    expect(
      viewerMayDownloadSessionPdfs({
        role: "tutor",
        viewerUserId: "tutor-eunice",
        sessionTutor: assignedTutor,
      }),
    ).toBe(true);
    expect(
      viewerMayDownloadSessionPdfs({
        role: "administrator",
        viewerUserId: "admin-1",
        sessionTutor: assignedTutor,
      }),
    ).toBe(true);
    expect(
      viewerMayDownloadSessionPdfs({
        role: "viewer",
        viewerUserId: "parent-1",
        sessionTutor: assignedTutor,
      }),
    ).toBe(false);
    expect(
      viewerMayDownloadSessionPdfs({
        role: "tutor",
        viewerUserId: "tutor-eunice",
        sessionTutor: { id: "tutor-eunice" },
      }),
    ).toBe(true);
    expect(
      viewerMayDownloadSessionPdfs({
        role: "tutor",
        viewerUserId: "tutor-other",
        sessionTutor: { id: "tutor-eunice", specialty: "SAT" },
      }),
    ).toBe(false);
    expect(sessionOffersQuestionPdfs([], "session-1")).toBe(false);
    expect(
      sessionOffersQuestionPdfs(
        [
          { sessionId: "session-1", status: "archived", questionCount: 10 },
          { sessionId: "other", status: "published", questionCount: 4 },
        ],
        "session-1",
      ),
    ).toBe(false);
    expect(
      sessionOffersQuestionPdfs(
        [{ sessionId: "session-1", status: "published", questionCount: 24 }],
        "session-1",
      ),
    ).toBe(true);
    render(
      <SessionTutorMaterials
        sessionId="session-1"
        assignments={[{ id: "pre", deliveryPhase: "before_session", title: "Routine pre-work" }]}
        homework={[
          {
            assignmentId: "pre",
            title: "Routine pre-work",
            attemptStatus: "paused",
            score: null,
            attemptId: null,
          },
        ]}
        beforeAssignmentId="pre"
        canDownloadPdfs={false}
      />,
    );
    expect(screen.getByTestId("tutor-completion-badge-pre").textContent).toBe("In progress");
    expect(screen.queryByTestId("download-session-questions")).toBeNull();
    expect(screen.queryByTestId("download-session-answer-key")).toBeNull();
  });

  test("toasts when a PDF download is forbidden or fails", async () => {
    vi.mocked(customFetch).mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    render(
      <SessionTutorMaterials
        sessionId="session-1"
        assignments={[{ id: "pre", deliveryPhase: "before_session" }]}
        homework={[]}
        beforeAssignmentId="pre"
        canDownloadPdfs
      />,
    );
    fireEvent.click(screen.getByTestId("download-session-answer-key"));
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Download not allowed" }),
      );
    });

    toast.mockClear();
    vi.mocked(customFetch).mockRejectedValue(Object.assign(new Error("missing"), { status: 404 }));
    fireEvent.click(screen.getByTestId("download-session-questions"));
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Could not download the PDF",
          description: "No questions are attached to this session.",
        }),
      );
    });

    toast.mockClear();
    vi.mocked(customFetch).mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByTestId("download-session-answer-key"));
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Could not download the PDF",
          description: "Try again in a moment.",
        }),
      );
    });
  });

  test("revokes the object URL after the browser has started the download", async () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:questions");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
    vi.mocked(customFetch).mockResolvedValue(new Blob(["%PDF"]));
    render(
      <SessionTutorMaterials
        sessionId="session-1"
        assignments={[{ id: "pre", deliveryPhase: "before_session" }]}
        homework={[]}
        beforeAssignmentId="pre"
        canDownloadPdfs
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("download-session-questions"));
    });
    expect(revoke).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(revoke).toHaveBeenCalledWith("blob:questions");
  });

  test("a follow-up quiz still offers the two session PDFs", () => {
    render(
      <SessionTutorMaterials
        sessionId="session-1"
        assignments={[{ id: "follow", deliveryPhase: "before_session", title: "Factoring Quiz" }]}
        homework={[{ assignmentId: "follow", title: "Factoring Quiz" }]}
        canDownloadPdfs
      />,
    );
    expect(screen.getByTestId("download-session-questions")).toBeTruthy();
    expect(screen.getByTestId("download-session-answer-key")).toBeTruthy();
  });

  test("the two buttons request the shared question PDF, with answers only on the key", async () => {
    vi.mocked(customFetch).mockResolvedValue(new Blob(["%PDF"]));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:session");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<SessionQuestionDownloads sessionId="sess-sat" />);
    fireEvent.click(screen.getByTestId("download-session-questions"));
    await waitFor(() => {
      expect(customFetch).toHaveBeenCalledWith(
        "/api/sessions/sess-sat/question-pdf",
        expect.objectContaining({ responseType: "blob" }),
      );
    });
    fireEvent.click(screen.getByTestId("download-session-answer-key"));
    await waitFor(() => {
      expect(customFetch).toHaveBeenCalledWith(
        "/api/sessions/sess-sat/question-pdf?answers=1",
        expect.objectContaining({ responseType: "blob" }),
      );
    });
  });
});
