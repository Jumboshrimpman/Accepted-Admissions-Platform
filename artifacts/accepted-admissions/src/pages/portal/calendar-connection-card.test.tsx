import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUserQuery: {
    data: { role: "tutor" },
  },
  connectionsQuery: {
    data: [] as Array<{
      id: string;
      tutorProfileId: string;
      provider: string;
      status: string;
    }>,
    isLoading: false,
    refetch: vi.fn(async () => undefined),
  },
  disconnectMutation: {
    isPending: false,
    mutate: vi.fn(),
  },
  trackCalendarConnection: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetCurrentUser: () => mocks.currentUserQuery,
  useListCalendarConnections: () => mocks.connectionsQuery,
  useDisconnectCalendar: () => mocks.disconnectMutation,
}));

vi.mock("@/lib/analytics", () => ({
  trackCalendarConnection: mocks.trackCalendarConnection,
}));

import { CalendarConnectionCard } from "./calendar-connection-card";

const location = "tutor_dashboard" as const;
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
  mocks.disconnectMutation.isPending = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("calendar connection funnel tracking", () => {
  test("tracks a launched authorization popup and shows its return message", () => {
    vi.spyOn(window, "open").mockReturnValue({} as Window);
    renderCard();

    fireEvent.click(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    );

    expect(window.open).toHaveBeenCalledWith(
      "/api/calendar/connect?redirect=1",
      "accepted-google-calendar",
    );
    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      "popup_launched",
    );
    expect(
      screen.getByText(
        "Google authorization opened in a separate window. Return here after granting access.",
      ),
    ).toBeTruthy();
  });

  test("tracks a blocked popup and exposes the direct authorization link", () => {
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
        "Your browser blocked the Google authorization window. Use the link below to open it directly.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open Google authorization" })
        .getAttribute("href"),
    ).toBe("/api/calendar/connect?redirect=1");
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
    ["cancelled", "cancelled"],
    ["rejected", "rejected"],
    ["unknown failure", "failed"],
  ])("tracks a %s authorization callback", (_label, outcome) => {
    renderCard();

    sendCalendarMessage({
      type: "accepted-admissions:calendar-connection-failed",
      outcome,
    });

    expect(mocks.trackCalendarConnection).toHaveBeenCalledWith(
      "tutor",
      location,
      outcome === "unknown failure" ? "failed" : outcome,
    );
    expect(
      screen.getByText(
        "Google Calendar authorization was not completed. Check the authorization window and try again.",
      ),
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
      "/api/calendar/connect?redirect=1",
      "accepted-google-calendar",
    );
    expect(
      screen.getByText(
        "Google authorization opened in a separate window. Return here after granting access.",
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