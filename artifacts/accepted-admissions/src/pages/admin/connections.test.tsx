import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { CalendarConnectionHealthRow } from "./connections";

const customFetch = vi.hoisted(() => vi.fn());

vi.mock("@workspace/api-client-react", () => ({
  customFetch: (...args: unknown[]) => customFetch(...args),
}));

import AdminConnections from "./connections";

const eunice: CalendarConnectionHealthRow = {
  tutorProfileId: "eunice-profile",
  name: "Eunice Chon",
  portalEmail: "eunice_chon@berkeley.edu",
  connectionStatus: "disconnected",
  badge: "needs_reconnect",
  googleAccountMasked: "e***@berkeley.edu",
  calendarIdMasked: "primary",
  hasRefreshToken: false,
  lastTokenRefreshAt: "2026-09-01T12:00:00.000Z",
  lastFreeBusyAt: null,
  lastError: "Google revoked the calendar grant. Reconnect is required.",
  lastErrorAt: "2026-10-01T12:00:00.000Z",
  bookable: true,
  hasUpcomingBookableTime: true,
  estimatedTokenAgeDays: 7,
  testingModeExpiryWarning:
    "Google Calendar grants from an OAuth consent screen in Testing mode expire after 7 days. This token is at least 6 days old and the last error matches that expiry. Reconnect this tutor.",
};

const xavier: CalendarConnectionHealthRow = {
  tutorProfileId: "xavier-profile",
  name: "Xavier Morales",
  portalEmail: "xaver.rmz6@gmail.com",
  connectionStatus: "connected",
  badge: "healthy",
  googleAccountMasked: "x***@gmail.com",
  calendarIdMasked: "primary",
  hasRefreshToken: true,
  lastTokenRefreshAt: "2026-10-14T12:00:00.000Z",
  lastFreeBusyAt: "2026-10-14T12:05:00.000Z",
  lastError: null,
  lastErrorAt: null,
  bookable: true,
  hasUpcomingBookableTime: true,
  estimatedTokenAgeDays: 1,
  testingModeExpiryWarning: null,
};

afterEach(() => {
  cleanup();
  customFetch.mockReset();
});

describe("Admin connections", () => {
  test("shows masked health for each tutor and runs a read-only free/busy test", async () => {
    customFetch.mockImplementation(async (url: string, options?: { method?: string }) => {
      if (String(url).endsWith("/test")) {
        return {
          connection: {
            ...eunice,
            badge: "healthy",
            connectionStatus: "connected",
            hasRefreshToken: true,
            lastFreeBusyAt: "2026-10-15T22:00:00.000Z",
            lastError: null,
            lastErrorAt: null,
          },
        };
      }
      return { connections: [xavier, eunice] };
    });

    render(<AdminConnections />);

    expect(await screen.findByText("Xavier Morales")).toBeTruthy();
    expect(screen.getByTestId("badge-calendar-connection-xavier-profile").textContent).toBe("Healthy");
    expect(screen.getByTestId("badge-calendar-connection-eunice-profile").textContent).toBe(
      "Needs reconnect",
    );
    expect(screen.getByText("e***@berkeley.edu")).toBeTruthy();
    expect(screen.getByText("Google revoked the calendar grant. Reconnect is required.")).toBeTruthy();
    expect(screen.getByTestId("status-calendar-connection-eunice-profile").textContent).toBe(
      "Needs reconnect",
    );
    expect(screen.getByTestId("status-calendar-connection-xavier-profile").textContent).toBe("Connected");
    expect(screen.getByTestId("token-age-eunice-profile").textContent).toBe("7 days");
    expect(screen.getByTestId("token-age-xavier-profile").textContent).toBe("1 day");
    expect(screen.getByTestId("warning-testing-mode-eunice-profile").textContent).toMatch(/Testing mode/);
    expect(screen.getByTestId("warning-testing-mode-eunice-profile").textContent).toMatch(/7 days/);
    expect(screen.queryByTestId("warning-testing-mode-xavier-profile")).toBeNull();
    expect(screen.getByText(/read-only free\/busy check/i)).toBeTruthy();
    expect(screen.getAllByText(/Text this link to the tutor/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/ya29|refresh_token|encrypted/i);

    fireEvent.click(screen.getByTestId("test-calendar-connection-eunice-profile"));

    await waitFor(() => {
      expect(screen.getByTestId("badge-calendar-connection-eunice-profile").textContent).toBe("Healthy");
    });
    expect(customFetch).toHaveBeenCalledWith(
      "/api/admin/calendar-connections/eunice-profile/test",
      { method: "POST" },
    );
    const testCall = customFetch.mock.calls.find((call) => String(call[0]).endsWith("/test"));
    expect(testCall?.[1]?.body).toBeUndefined();
  });

  test("shows Needs attention with the error and does not replace a revoked message", async () => {
    const nika: CalendarConnectionHealthRow = {
      tutorProfileId: "nika-profile",
      name: "Nika Raiffe",
      portalEmail: "nika.raiffe@gmail.com",
      connectionStatus: "connected",
      badge: "needs_attention",
      googleAccountMasked: "Unknown (reconnect to record)",
      calendarIdMasked: "primary",
      hasRefreshToken: true,
      lastTokenRefreshAt: "2026-10-14T12:00:00.000Z",
      lastFreeBusyAt: null,
      lastError: "The free/busy check failed.",
      lastErrorAt: "2026-10-15T12:00:00.000Z",
      bookable: true,
      hasUpcomingBookableTime: true,
      estimatedTokenAgeDays: 2,
      testingModeExpiryWarning: null,
    };
    const neverConnected: CalendarConnectionHealthRow = {
      tutorProfileId: "new-profile",
      name: "Aurelia Finch",
      portalEmail: "aurelia@example.com",
      connectionStatus: "disconnected",
      badge: "not_connected",
      googleAccountMasked: null,
      calendarIdMasked: null,
      hasRefreshToken: false,
      lastTokenRefreshAt: null,
      lastFreeBusyAt: null,
      lastError: null,
      lastErrorAt: null,
      bookable: false,
      hasUpcomingBookableTime: false,
      estimatedTokenAgeDays: null,
      testingModeExpiryWarning: null,
    };
    customFetch.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/test")) return { connection: eunice };
      return { connections: [nika, neverConnected, eunice] };
    });

    render(<AdminConnections />);

    expect(await screen.findByText("Nika Raiffe")).toBeTruthy();
    expect(screen.getByTestId("badge-calendar-connection-nika-profile").textContent).toBe(
      "Needs attention",
    );
    expect(screen.getByText("The free/busy check failed.")).toBeTruthy();
    expect(screen.getByText("Unknown (reconnect to record)")).toBeTruthy();
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
    expect(screen.getByTestId("token-age-new-profile").textContent).toBe("Unknown");

    fireEvent.click(screen.getByTestId("test-calendar-connection-eunice-profile"));
    await waitFor(() => {
      expect(customFetch).toHaveBeenCalledWith(
        "/api/admin/calendar-connections/eunice-profile/test",
        { method: "POST" },
      );
    });
    expect(screen.getByTestId("badge-calendar-connection-eunice-profile").textContent).toBe(
      "Needs reconnect",
    );
    expect(screen.getByText("Google revoked the calendar grant. Reconnect is required.")).toBeTruthy();
  });

  test("shows the server wait message when Test now is cooling down", async () => {
    const waiting = new Error("HTTP 429 Too Many Requests");
    Object.assign(waiting, {
      data: { error: "Wait 35 seconds before testing this calendar again.", retryAfterSeconds: 35 },
    });
    customFetch.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/test")) throw waiting;
      return { connections: [xavier] };
    });

    render(<AdminConnections />);
    fireEvent.click(await screen.findByTestId("test-calendar-connection-xavier-profile"));

    expect(
      await screen.findByText("Wait 35 seconds before testing this calendar again."),
    ).toBeTruthy();
    expect(screen.queryByText("HTTP 429 Too Many Requests")).toBeNull();
  });

  test("copies an admin reconnect link for the tutor without sending email", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    customFetch.mockImplementation(async (url: string) => {
      if (String(url).endsWith("/reconnect-link")) {
        return {
          url: "https://accounts.google.com/o/oauth2/v2/auth?state=signed-xavier",
          expiresAt: "2026-10-17T10:39:00.000Z",
        };
      }
      return { connections: [xavier, eunice] };
    });

    render(<AdminConnections />);
    fireEvent.click(await screen.findByTestId("copy-reconnect-link-xavier-profile"));

    await waitFor(() => {
      expect(screen.getByTestId("reconnect-link-xavier-profile").getAttribute("value")).toBe(
        "https://accounts.google.com/o/oauth2/v2/auth?state=signed-xavier",
      );
    });
    expect(customFetch).toHaveBeenCalledWith(
      "/api/admin/calendar-connections/xavier-profile/reconnect-link",
      { method: "POST" },
    );
    expect(writeText).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/v2/auth?state=signed-xavier",
    );
    expect(document.body.textContent).not.toMatch(/mailto:/i);
  });
});
