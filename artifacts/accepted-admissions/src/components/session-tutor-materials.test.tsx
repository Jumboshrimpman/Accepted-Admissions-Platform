import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { customFetch } from "@workspace/api-client-react";
import { SessionTutorMaterials, viewerMayDownloadSessionPdfs } from "./session-tutor-materials";

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
    expect(screen.getByTestId("tutor-completion-badge-pre").textContent).toBe("Paused");
    expect(screen.getByTestId("tutor-completion-badge-home").textContent).toBe("Not started");
    expect(screen.getByTestId("tutor-completion-pre").textContent).toMatch(/Pre-work/);
    expect(screen.getByTestId("tutor-completion-home").textContent).toMatch(/Homework/);
    expect(screen.getByRole("link", { name: "Review attempt" }).getAttribute("href")).toBe(
      "/tutor/attempts/attempt-pre",
    );
    expect(screen.getByTestId("download-prework-questions")).toBeTruthy();
    expect(screen.getByTestId("download-in-session-answer-key")).toBeTruthy();
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
    expect(screen.getByTestId("tutor-completion-badge-pre").textContent).toBe("Paused");
    expect(screen.queryByTestId("download-prework-questions")).toBeNull();
    expect(screen.queryByTestId("download-prework-answer-key")).toBeNull();
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
    fireEvent.click(screen.getByTestId("download-prework-answer-key"));
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Download not allowed" }),
      );
    });

    toast.mockClear();
    vi.mocked(customFetch).mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByTestId("download-prework-questions"));
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Could not download the PDF" }),
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
      fireEvent.click(screen.getByTestId("download-prework-questions"));
    });
    expect(revoke).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(revoke).toHaveBeenCalledWith("blob:questions");
  });
});
