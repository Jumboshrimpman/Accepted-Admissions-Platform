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
  test("shows whether the admin invite calendar can send automatically", async () => {
    customFetch.mockResolvedValue({
      connections: [xavier],
      adminCalendarInvites: {
        healthy: true,
        accountEmail: "admin@acceptedadmissions.org",
        hasRefreshToken: true,
        hasWriteScope: true,
        hasAppCalendar: true,
      },
    });

    render(<AdminConnections />);

    expect(await screen.findByTestId("admin-calendar-invites")).toBeTruthy();
    expect(screen.getByText("Admin calendar (invites)")).toBeTruthy();
    expect(screen.getByTestId("badge-admin-calendar-invites").textContent).toBe("Healthy");
    expect(screen.getByTestId("status-admin-calendar-invites").textContent).toBe(
      "admin@ sends invites only for Nika's fixed-window fallback.",
    );
  });

  test("shows the admin invite calendar as not ready when the writer is missing a piece", async () => {
    customFetch.mockResolvedValue({
      connections: [],
      adminCalendarInvites: {
        healthy: false,
        accountEmail: "admin@acceptedadmissions.org",
        hasRefreshToken: true,
        hasWriteScope: false,
        hasAppCalendar: false,
      },
    });

    render(<AdminConnections />);

    expect(await screen.findByTestId("badge-admin-calendar-invites")).toBeTruthy();
    expect(screen.getByTestId("badge-admin-calendar-invites").textContent).toBe("Not ready");
    expect(screen.getByTestId("status-admin-calendar-invites").textContent).toBe(
      "admin@ sends invites only for Nika's fixed-window fallback. This account is not ready.",
    );
    expect(screen.getByText("Event-write scope").parentElement?.textContent).toContain("No");
    expect(screen.getByText("Sessions calendar").parentElement?.textContent).toContain("No");
  });

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

  test("a free/busy-only grant stays Needs reconnect and names the missing invite access", async () => {
    const xavierFreeBusy: CalendarConnectionHealthRow = {
      ...xavier,
      badge: "needs_reconnect",
      calendarIdMasked: "primary",
      statusLabel: "Connected (free/busy only): reconnect to enable bookings and invites",
    };
    customFetch.mockResolvedValue({ connections: [xavierFreeBusy] });

    render(<AdminConnections />);

    expect(await screen.findByTestId("badge-calendar-connection-xavier-profile")).toBeTruthy();
    expect(screen.getByTestId("badge-calendar-connection-xavier-profile").textContent).toBe(
      "Needs reconnect",
    );
    expect(screen.getByTestId("status-calendar-connection-xavier-profile").textContent).toBe(
      "Connected (free/busy only): reconnect to enable bookings and invites",
    );
  });

  test("Nika's connection card notes the admin calendar fallback", async () => {
    const nikaFallback: CalendarConnectionHealthRow = {
      tutorProfileId: "nika-profile",
      name: "Nika Raiffe",
      portalEmail: "nika.raiffe@gmail.com",
      connectionStatus: "disconnected",
      badge: "needs_reconnect",
      googleAccountMasked: null,
      calendarIdMasked: null,
      hasRefreshToken: false,
      lastTokenRefreshAt: null,
      lastFreeBusyAt: null,
      lastError: null,
      lastErrorAt: null,
      bookable: true,
      hasUpcomingBookableTime: true,
      estimatedTokenAgeDays: null,
      testingModeExpiryWarning: null,
      usesAdminCalendarFallback: true,
    };
    customFetch.mockResolvedValue({ connections: [nikaFallback, xavier] });
    render(<AdminConnections />);

    expect(await screen.findByTestId("admin-calendar-fallback-nika-profile")).toBeTruthy();
    expect(screen.getByText("Bookings use admin calendar fallback")).toBeTruthy();
    expect(screen.queryByTestId("admin-calendar-fallback-xavier-profile")).toBeNull();
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

  test("previews missing admin attendees and adds them only after confirmation", async () => {
    const later = {
      sessionId: "later",
      title: "Michelle's SAT Session with Xavier",
      start: "2026-10-18T18:00:00.000Z",
      studentName: "Michelle Makarem",
      tutorName: "Xavier Morales",
      sessionType: "SAT",
      eventId: "evt-michelle",
    };
    const soon = {
      sessionId: "soon",
      start: "2026-10-16T15:00:00.000Z",
      studentName: "Taito Goto",
      tutorName: "Eunice Chon",
      sessionType: "SAT",
      eventId: "evt-taito",
      reason: "starts_within_60_minutes",
    };
    const present = {
      sessionId: "present",
      start: "2026-10-19T18:00:00.000Z",
      studentName: "Neel Dharni",
      tutorName: "Nika Raiffe",
      sessionType: "College Consulting",
      eventId: "evt-neel",
    };
    const unread = {
      sessionId: "unread",
      start: "2026-10-20T18:00:00.000Z",
      studentName: "Aurelia Finch",
      tutorName: "Victoria Wijerathnayapa",
      sessionType: "SAT",
      eventId: "evt-aurelia",
      reason: "event_unreadable",
    };
    const preview = {
      dryRun: true,
      missing: [later],
      refused: [soon],
      alreadyPresent: 1,
      alreadyPresentSessions: [present],
      skipped: [unread],
      patched: [],
    };
    const applied = {
      dryRun: false,
      missing: [later],
      refused: [soon],
      alreadyPresent: 1,
      alreadyPresentSessions: [present],
      skipped: [unread],
      patched: ["later"],
    };
    customFetch.mockImplementation(async (url: string, options?: { body?: string }) => {
      if (String(url).includes("/api/admin/calendar-attendees/backfill")) {
        const body = JSON.parse(String(options?.body ?? "{}")) as { dryRun?: boolean };
        return body.dryRun ? preview : applied;
      }
      return { connections: [xavier] };
    });

    render(<AdminConnections />);
    expect(await screen.findByTestId("preview-admin-attendees")).toBeTruthy();
    expect(screen.queryByTestId("add-admin-attendees")).toBeNull();

    fireEvent.click(screen.getByTestId("preview-admin-attendees"));

    expect(await screen.findByTestId("backfill-missing-later")).toBeTruthy();
    expect(customFetch).toHaveBeenCalledWith("/api/admin/calendar-attendees/backfill", {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    });
    expect(screen.getByTestId("backfill-missing-later").textContent).toMatch(/Sun, Oct 18, 2026/);
    expect(screen.getByTestId("backfill-missing-later").textContent).toMatch(/2:00 PM EDT/);
    expect(screen.getByTestId("backfill-missing-later").textContent).toMatch(/Michelle Makarem/);
    expect(screen.getByTestId("backfill-missing-later").textContent).toMatch(/Xavier Morales/);
    expect(screen.getByTestId("backfill-missing-later").textContent).toMatch(/SAT/);
    expect(screen.getByTestId("backfill-missing-later").textContent).toMatch(/evt-michelle/);
    expect(screen.getByTestId("backfill-refused-soon").textContent).toMatch(/Taito Goto/);
    expect(screen.getByTestId("backfill-refused-soon").textContent).toMatch(/Starts within 60 minutes/);
    expect(screen.getByTestId("backfill-already-present-present").textContent).toMatch(/Neel Dharni/);
    expect(screen.getByTestId("backfill-already-present-present").textContent).toMatch(/College Consulting/);
    expect(screen.getByTestId("backfill-skipped-unread").textContent).toMatch(/Event could not be read/);
    expect(screen.getByTestId("add-admin-attendees")).toBeTruthy();

    fireEvent.click(screen.getByTestId("add-admin-attendees"));
    expect(screen.getByText(/Guests are not emailed/)).toBeTruthy();
    expect(
      customFetch.mock.calls.filter((call) => String(call[0]).includes("calendar-attendees/backfill")),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      customFetch.mock.calls.filter((call) => String(call[0]).includes("calendar-attendees/backfill")),
    ).toHaveLength(1);

    fireEvent.click(screen.getByTestId("add-admin-attendees"));
    fireEvent.click(screen.getByTestId("confirm-add-admin-attendees"));

    expect(await screen.findByTestId("backfill-outcomes-later")).toBeTruthy();
    expect(customFetch).toHaveBeenCalledWith("/api/admin/calendar-attendees/backfill", {
      method: "POST",
      body: JSON.stringify({ dryRun: false }),
    });
    expect(screen.getByTestId("backfill-outcomes-later").textContent).toMatch(/Added/);
    expect(screen.getByTestId("backfill-outcomes-later").textContent).toMatch(/evt-michelle/);
    expect(screen.getByTestId("backfill-outcomes-soon").textContent).toMatch(/Refused/);
    expect(screen.getByTestId("backfill-outcomes-present").textContent).toMatch(/Already present/);
    expect(screen.getByTestId("backfill-outcomes-unread").textContent).toMatch(/Skipped/);
    expect(screen.queryByTestId("add-admin-attendees")).toBeNull();
    expect(document.body.textContent).not.toMatch(/mailto:/i);
  });
});
