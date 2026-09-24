import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const customFetch = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  customFetch: (...args: unknown[]) => customFetch(...args),
}));

import { ClearHomeworkButton } from "./clear-homework-button";

afterEach(() => {
  cleanup();
  customFetch.mockReset();
});

describe("ClearHomeworkButton", () => {
  test("asks for confirmation before clearing homework", async () => {
    customFetch.mockResolvedValue({
      sessionId: "session-1",
      assignmentIds: ["quiz-1"],
      deletedAttempts: 1,
      keptAssignments: 1,
    });
    const onCleared = vi.fn();
    render(<ClearHomeworkButton sessionId="session-1" onCleared={onCleared} />);

    fireEvent.click(screen.getByTestId("clear-homework-session-1"));
    expect(customFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/same assignment and questions stay attached/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("clear-homework-session-1-confirm"));
    expect(customFetch).toHaveBeenCalledWith(
      "/api/sessions/session-1/clear-prework",
      expect.objectContaining({ method: "POST" }),
    );
    await vi.waitFor(() => expect(onCleared).toHaveBeenCalled());
  });

  test("posts the in-session assignment when clearing that homework", async () => {
    customFetch.mockResolvedValue({
      sessionId: "session-1",
      assignmentIds: ["during-1"],
      deletedAttempts: 2,
      keptAssignments: 1,
      deliveryPhase: "during_session",
    });
    render(
      <ClearHomeworkButton
        sessionId="session-1"
        assignmentId="during-1"
        deliveryPhase="during_session"
        testId="clear-in-session"
      />,
    );
    fireEvent.click(screen.getByTestId("clear-in-session"));
    expect(screen.getByText(/before-session diagnostics are not changed/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("clear-in-session-confirm"));
    expect(customFetch).toHaveBeenCalledWith(
      "/api/sessions/session-1/clear-prework",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          assignmentId: "during-1",
          deliveryPhase: "during_session",
        }),
      }),
    );
  });
});
