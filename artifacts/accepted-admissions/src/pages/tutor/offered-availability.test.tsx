import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: mocks.customFetch,
}));

import { TutorOfferedAvailability } from "./offered-availability";

const CONNECT_URL = "/api/calendar/connect?redirect=1&returnTo=%2Ftutor";

afterEach(() => {
  cleanup();
  mocks.customFetch.mockReset();
});

describe("tutor offered availability", () => {
  test("disconnected calendar tells the tutor clients cannot book and links to connect", async () => {
    mocks.customFetch.mockResolvedValue({
      from: "2026-10-17T14:00:00.000Z",
      to: "2026-10-31T14:00:00.000Z",
      timezone: "America/New_York",
      providerStatus: "disconnected",
      lengths: [
        { durationMinutes: 60, slots: [] },
        { durationMinutes: 90, slots: [] },
        { durationMinutes: 120, slots: [] },
      ],
    });
    render(<TutorOfferedAvailability />);

    const notice = await screen.findByTestId("tutor-offered-disconnected");
    expect(notice.textContent).toContain(
      "Clients cannot book you until Google Calendar is connected.",
    );
    expect(screen.getByRole("link", { name: "Connect Google Calendar" }).getAttribute("href")).toBe(
      CONNECT_URL,
    );
    expect(screen.getByText(/Times are shown in ET \(America\/New_York\)/)).toBeTruthy();
    expect(notice.textContent).not.toMatch(/@/);
    expect(screen.queryByText(/Quinlan Piihold/)).toBeNull();
  });

  test("shows the same open times in the tutor timezone for 1 hour, 1.5 hours, and 2 hours", async () => {
    mocks.customFetch.mockResolvedValue({
      from: "2026-10-17T14:00:00.000Z",
      to: "2026-10-31T14:00:00.000Z",
      timezone: "America/New_York",
      providerStatus: "connected",
      lengths: [
        { durationMinutes: 60, slots: ["2026-10-20T19:00:00.000Z"] },
        { durationMinutes: 90, slots: [] },
        { durationMinutes: 120, slots: ["2026-10-20T19:00:00.000Z", "2026-10-20T21:00:00.000Z"] },
      ],
    });
    render(<TutorOfferedAvailability />);

    expect(await screen.findByRole("region", { name: "1 hour" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "1.5 hours" }).textContent).toContain("No open times");
    const twoHours = screen.getByRole("region", { name: "2 hours" });
    expect(twoHours.textContent).toContain("3:00 PM");
    expect(twoHours.textContent).toContain("5:00 PM");
    expect(twoHours.textContent).toContain("Tuesday, October 20, 2026");
    expect(screen.getByTestId("tutor-offered-availability").textContent).not.toMatch(/@/);
    expect(screen.queryByText(/Quinlan Piihold/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Connect Google Calendar" })).toBeNull();
  });

  test("a disconnected fixed window still lists the times clients can book", async () => {
    mocks.customFetch.mockResolvedValue({
      from: "2026-10-17T14:00:00.000Z",
      to: "2026-10-31T14:00:00.000Z",
      timezone: "America/New_York",
      providerStatus: "disconnected",
      lengths: [
        { durationMinutes: 60, slots: ["2026-10-21T14:00:00.000Z"] },
        { durationMinutes: 90, slots: [] },
        { durationMinutes: 120, slots: [] },
      ],
    });
    render(<TutorOfferedAvailability />);

    const hour = await screen.findByRole("region", { name: "1 hour" });
    expect(hour.textContent).toContain("10:00 AM");
    expect(hour.textContent).toContain("Wednesday, October 21, 2026");
    expect(screen.queryByTestId("tutor-offered-disconnected")).toBeNull();
    expect(screen.queryByRole("link", { name: "Connect Google Calendar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Reconnect Google Calendar" })).toBeNull();
  });

  test("a missing app calendar shows reconnect instead of unbookable times", async () => {
    mocks.customFetch.mockResolvedValue({
      from: "2026-10-17T14:00:00.000Z",
      to: "2026-10-31T14:00:00.000Z",
      timezone: "America/New_York",
      providerStatus: "reconnect",
      lengths: [
        { durationMinutes: 60, slots: [] },
        { durationMinutes: 90, slots: [] },
        { durationMinutes: 120, slots: [] },
      ],
    });
    render(<TutorOfferedAvailability />);

    const notice = await screen.findByTestId("tutor-offered-reconnect");
    expect(notice.textContent).toContain("Reconnect Google Calendar to offer bookable times.");
    expect(notice.textContent).toContain("a booking would be refused");
    expect(screen.getByRole("link", { name: "Reconnect Google Calendar" }).getAttribute("href")).toBe(
      CONNECT_URL,
    );
    expect(screen.queryByRole("region", { name: "1 hour" })).toBeNull();
    expect(screen.queryByText("10:00 AM")).toBeNull();
    expect(notice.textContent).not.toMatch(/@/);
  });

  test("a tutor who is not offered sees no times", async () => {
    mocks.customFetch.mockResolvedValue({
      from: "2026-10-17T14:00:00.000Z",
      to: "2026-10-31T14:00:00.000Z",
      timezone: "America/New_York",
      providerStatus: "disconnected",
      offeredToClients: false,
      availabilityDependsOnClient: false,
      lengths: [
        { durationMinutes: 60, slots: [] },
        { durationMinutes: 90, slots: [] },
        { durationMinutes: 120, slots: [] },
      ],
    });
    render(<TutorOfferedAvailability />);

    const notice = await screen.findByTestId("tutor-offered-not-listed");
    expect(notice.textContent).toContain("You are not currently offered for booking.");
    expect(screen.queryByRole("region", { name: "1 hour" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Connect Google Calendar" })).toBeNull();
    expect(screen.queryByTestId("tutor-offered-client-specific")).toBeNull();
  });

  test("approved-client tutors note that only those clients see these times", async () => {
    mocks.customFetch.mockResolvedValue({
      from: "2026-10-17T14:00:00.000Z",
      to: "2026-10-31T14:00:00.000Z",
      timezone: "America/New_York",
      providerStatus: "disconnected",
      offeredToClients: true,
      availabilityDependsOnClient: true,
      lengths: [
        { durationMinutes: 60, slots: ["2026-10-21T14:00:00.000Z"] },
        { durationMinutes: 90, slots: [] },
        { durationMinutes: 120, slots: [] },
      ],
    });
    render(<TutorOfferedAvailability />);

    expect(await screen.findByTestId("tutor-offered-client-specific")).toBeTruthy();
    expect(
      screen.getByText("Only approved clients can book you; those clients see these times."),
    ).toBeTruthy();
    expect((await screen.findByRole("region", { name: "1 hour" })).textContent).toContain("10:00 AM");
  });

  test("the tutor card hides the admin calendar fallback and still lists open times", async () => {
    mocks.customFetch.mockResolvedValue({
      from: "2026-10-17T14:00:00.000Z",
      to: "2026-10-31T14:00:00.000Z",
      timezone: "America/New_York",
      providerStatus: "disconnected",
      offeredToClients: true,
      availabilityDependsOnClient: true,
      usesAdminCalendarFallback: true,
      lengths: [
        { durationMinutes: 60, slots: ["2026-10-21T22:05:00.000Z"] },
        { durationMinutes: 90, slots: [] },
        { durationMinutes: 120, slots: [] },
      ],
    });
    render(<TutorOfferedAvailability />);

    expect(await screen.findByRole("region", { name: "1 hour" })).toBeTruthy();
    expect(screen.queryByText("Bookings use admin calendar fallback")).toBeNull();
    expect(screen.queryByTestId("tutor-offered-admin-fallback")).toBeNull();
    expect((await screen.findByRole("region", { name: "1 hour" })).textContent).toContain("6:05 PM");
  });

  test("hides the section when this login has no tutor profile", async () => {
    const missing = new Error("Tutor profile not found") as Error & { status: number };
    missing.status = 404;
    mocks.customFetch.mockRejectedValue(missing);
    render(<TutorOfferedAvailability />);

    await waitFor(() => {
      expect(screen.queryByTestId("tutor-offered-availability")).toBeNull();
    });
  });
});
