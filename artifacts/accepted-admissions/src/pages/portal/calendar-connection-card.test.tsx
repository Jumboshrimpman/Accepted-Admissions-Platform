import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type CalendarRow = {
    id: string;
    tutorProfileId: string;
    provider: string;
    status: string;
  };
  return {
  currentUserQuery: {
    data: { role: "tutor" },
  },
  connectionsQuery: {
    data: [] as CalendarRow[],
    isLoading: false,
    refetch: vi.fn(async (): Promise<{ data: CalendarRow[] }> => ({
      data: [],
    })),
  },
  disconnectMutation: {
    isPending: false,
    mutate: vi.fn(),
  },
  trackCalendarConnection: vi.fn(),
  };
});

vi.mock("@workspace/api-client-react", () => ({
  useGetCurrentUser: () => mocks.currentUserQuery,
  useListCalendarConnections: () => mocks.connectionsQuery,
  useDisconnectCalendar: () => mocks.disconnectMutation,
}));

vi.mock("@/lib/analytics", () => ({
  trackCalendarConnection: mocks.trackCalendarConnection,
}));

import {
  CalendarConnectionCard,
  calendarConnectUrl,
  messageForCalendarOutcome,
  readCalendarReturnQuery,
} from "./calendar-connection-card";

const location = "tutor_dashboard" as const;
const connectUrl = "/api/calendar/connect?redirect=1&returnTo=%2Ftutor";
const connectedCalendar = {
  id: "calendar-connection-1",
  tutorProfileId: "tutor-profile-1",
  provider: "google",
  status: "connected",
};

function renderCard() {
  return render(<CalendarConnectionCard location={location} />);
}

function sendCalendarMessage(data: Record<string, string>) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: window.location.origin,
      }),
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUserQuery.data = { role: "tutor" };
  mocks.connectionsQuery.data = [];
  mocks.connectionsQuery.isLoading = false;
  mocks.connectionsQuery.refetch = vi.fn(async () => ({ data: [] }));
  mocks.disconnectMutation.isPending = false;
  window.history.replaceState(null, "", "/tutor");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("calendar connection helpers", () => {
  test("builds a connect URL that returns to the tutor dashboard", () => {
    expect(calendarConnectUrl("tutor_dashboard")).toBe(connectUrl);
    expect(calendarConnectUrl("admin_dashboard")).toBe(
      "/api/calendar/connect?redirect=1&returnTo=%2Fadmin",
    );
  });

  test("maps failure outcomes to concrete tutor-visible reasons", () => {
    expect(messageForCalendarOutcome("cancelled")).toContain("cancelled");
    expect(messageForCalendarOutcome("rejected")).toContain("does not match");
    expect(messageForCalendarOutcome("misconfigured")).toContain("not configured");
    expect(messageForCalendarOutcome("redirect_mismatch")).toContain("allowlist");
    expect(messageForCalendarOutcome("unavailable")).toContain("temporarily unavailable");
    expect(messageForCalendarOutcome("expired")).toContain("expired");
    expect(messageForCalendarOutcome("failed")).toContain("authorization failed");
  });

  test("reads connected and error return query parameters", () => {
    expect(readCalendarReturnQuery("?calendar=connected")).toEqual({
      success: true,
      outcome: "connected",
      message: "Google Calendar connected successfully.",
    });
    expect(readCalendarReturnQuery("?calendar=error&reason=redirect_mismatch")).toEqual({
      success: false,
      outcome: "redirect_mismatch",
      message: messageForCalendarOutcome("redirect_mismatch"),
    });
  });
});

describe("calendar connection funnel tracking", () => {
  test("tracks a launched authorization popup and shows its return message", () => {
    vi.spyOn(window, "open").mockReturnValue({} as Window);
    renderCard();

    fireEvent.click(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    );

    expect(window.open).toHaveBeenCalledWith(
      connectUrl,
      "accepted-google-calendar",
    );
    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      "popup_launched",
    );
    expect(
      screen.getByText(
        "Google authorization opened in a separate window. Return here after granting access, or continue in this tab if the window does not update.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Continue in this tab" })
        .getAttribute("href"),
    ).toBe(connectUrl);
  });

  test("tracks a blocked popup and exposes popup plus same-tab fallbacks", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    renderCard();

    fireEvent.click(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    );

    expect(mocks.trackCalendarConnection).toHaveBeenNthCalledWith(
      1,
      "tutor",
      location,
      "popup_launched",
    );
    expect(mocks.trackCalendarConnection).toHaveBeenNthCalledWith(
      2,
      "tutor",
      location,
      "popup_blocked",
    );
    expect(
      screen.getByText(
        "Your browser blocked the Google authorization window. Continue in this tab or open it in a new window.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open Google authorization" })
        .getAttribute("href"),
    ).toBe(connectUrl);
    expect(
      screen
        .getByRole("link", { name: "Continue in this tab" })
        .getAttribute("target"),
    ).toBeNull();
  });

  test("tracks a successful callback, refreshes connections, and updates the UI", () => {
    renderCard();

    sendCalendarMessage({
      type: "accepted-admissions:calendar-connected",
      outcome: "connected",
    });

    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      "connected",
    );
    expect(mocks.connectionsQuery.refetch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Google Calendar connected successfully."),
    ).toBeTruthy();
  });

  test.each([
    ["cancelled", "You cancelled Google authorization. No calendar changes were made."],
    [
      "rejected",
      "Google rejected authorization, or the chosen account does not match this portal email.",
    ],
    [
      "misconfigured",
      "Google Calendar is not configured for this workspace. Ask an administrator to check the Calendar environment variables.",
    ],
    [
      "redirect_mismatch",
      "Google rejected the return URL. An administrator must allowlist the exact Calendar callback URL in Google Cloud Console.",
    ],
    ["unavailable", "Google Calendar is temporarily unavailable. Try again in a few minutes."],
    [
      "expired",
      "This authorization link expired or is no longer valid. Start Connect again from the dashboard.",
    ],
    ["unknown failure", "Google Calendar authorization failed. Close the authorization window and try again."],
  ])("shows a concrete %s authorization message", (label, message) => {
    renderCard();

    sendCalendarMessage({
      type: "accepted-admissions:calendar-connection-failed",
      outcome: label === "unknown failure" ? "not-a-real-outcome" : label,
    });

    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      label === "unknown failure" ? "failed" : label,
    );
    expect(screen.getByText(message)).toBeTruthy();
  });

  test("prefers the callback message when the completion page sends one", () => {
    renderCard();

    sendCalendarMessage({
      type: "accepted-admissions:calendar-connection-failed",
      outcome: "rejected",
      message: "Choose the Google account that matches your portal sign-in email.",
    });

    expect(
      screen.getByText("Choose the Google account that matches your portal sign-in email."),
    ).toBeTruthy();
  });

  test("applies a full-page return query and clears it from the URL", () => {
    window.history.replaceState(null, "", "/tutor?calendar=error&reason=cancelled&keep=1");
    renderCard();

    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      "cancelled",
    );
    expect(
      screen.getByText("You cancelled Google authorization. No calendar changes were made."),
    ).toBeTruthy();
    expect(window.location.search).toBe("?keep=1");
  });

  test("refetches connections when the tutor returns to the tab after launching OAuth", async () => {
    vi.spyOn(window, "open").mockReturnValue({} as Window);
    mocks.connectionsQuery.refetch.mockResolvedValue({
      data: [connectedCalendar],
    });
    renderCard();
    fireEvent.click(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(mocks.connectionsQuery.refetch).toHaveBeenCalled();
    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      "connected",
    );
    expect(
      screen.getByText("Google Calendar connected successfully."),
    ).toBeTruthy();
  });

  test("tracks a successful disconnect, refreshes connections, and updates the UI", () => {
    mocks.connectionsQuery.data = [connectedCalendar];
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(mocks.disconnectMutation.mutate).toHaveBeenCalledWith(
      { tutorProfileId: "tutor-profile-1" },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    const options = mocks.disconnectMutation.mutate.mock.calls[0][1];
    act(() => {
      options.onSuccess();
    });

    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      "disconnected",
    );
    expect(mocks.connectionsQuery.refetch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        "Google Calendar disconnected. Students will no longer see times until it is reconnected.",
      ),
    ).toBeTruthy();
  });

  test("tracks a failed disconnect and keeps the connected UI usable", () => {
    mocks.connectionsQuery.data = [connectedCalendar];
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const options = mocks.disconnectMutation.mutate.mock.calls[0][1];
    act(() => {
      options.onError(new Error("disconnect failed"));
    });

    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      "disconnect_failed",
    );
    expect(mocks.connectionsQuery.refetch).not.toHaveBeenCalled();
    expect(
      screen.getByText("The calendar could not be disconnected. Please try again."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeTruthy();
  });

  test("keeps launch behavior working when analytics throws", () => {
    mocks.trackCalendarConnection.mockImplementation(() => {
      throw new Error("analytics unavailable");
    });
    vi.spyOn(window, "open").mockReturnValue({} as Window);
    renderCard();

    expect(() => {
      fireEvent.click(
        screen.getByRole("button", { name: "Connect Google Calendar" }),
      );
    }).not.toThrow();

    expect(window.open).toHaveBeenCalledWith(
      connectUrl,
      "accepted-google-calendar",
    );
    expect(
      screen.getByText(
        "Google authorization opened in a separate window. Return here after granting access, or continue in this tab if the window does not update.",
      ),
    ).toBeTruthy();
  });

  test("keeps disconnect mutation behavior working when analytics throws", () => {
    mocks.connectionsQuery.data = [connectedCalendar];
    mocks.trackCalendarConnection.mockImplementation(() => {
      throw new Error("analytics unavailable");
    });
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const options = mocks.disconnectMutation.mutate.mock.calls[0][1];
    act(() => {
      options.onSuccess();
    });

    expect(mocks.connectionsQuery.refetch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(
        "Google Calendar disconnected. Students will no longer see times until it is reconnected.",
      ),
    ).toBeTruthy();
  });
});
