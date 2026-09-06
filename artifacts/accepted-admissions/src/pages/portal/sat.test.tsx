import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PORTAL_SAT_HREF } from "@/lib/portal-sat";

const mocks = vi.hoisted(() => ({
  dashboard: {
    data: {
      credits: { selfServeSatBooking: true, remainingHours: 0, purchasedHours: 0, usedHours: 0 },
      user: { role: "student", id: "student-1", displayName: "Michelle" },
      upcomingSessions: [
        {
          id: "sat-1",
          subject: "SAT",
          title: "Michelle’s SAT Session with Xavier",
          dateTime: "2026-10-02T16:00:00.000Z",
          timezone: "America/New_York",
          tutor: { name: "Xavier Morales" },
        },
      ],
    },
    isLoading: false,
    error: null,
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetCurrentUserQueryKey: () => ["/api/me"],
  getGetDashboardQueryKey: () => ["/api/dashboard"],
  getGetBookingAvailabilityQueryKey: () => ["availability"],
  getListBookingSessionsQueryKey: () => ["sessions"],
  useGetCurrentUser: () => ({ data: { role: "student" }, isLoading: false }),
  useGetDashboard: () => mocks.dashboard,
  useCreatePaymentCheckout: () => ({ mutate: vi.fn(), isPending: false }),
  useListBookingTutors: () => ({ data: [], isLoading: false }),
  useListBookingSessions: () => ({ data: [], isLoading: false }),
  useGetBookingAvailability: () => ({ data: null, isLoading: false }),
  useCreateBookingSession: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelBookingSession: () => ({ mutate: vi.fn(), isPending: false }),
  useRescheduleBookingSession: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => [PORTAL_SAT_HREF, vi.fn()],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import PortalSat from "./sat";

afterEach(() => {
  cleanup();
  mocks.dashboard.data.credits.selfServeSatBooking = true;
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "prod-1",
          slug: "sat-hour",
          name: "Single SAT session",
          description: "One prepaid hour",
          durationHours: 1,
          totalPriceCents: 13000,
          effectiveHourlyRateCents: 13000,
        },
      ],
    })),
  );
});

describe("portal SAT book/pay", () => {
  test("keeps purchase and booking inside the portal shell", () => {
    render(<PortalSat />);
    expect(screen.getByTestId("portal-sat-page")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "SAT book and pay" })).toBeTruthy();
    expect(screen.getByTestId("portal-sat-purchase")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-upcoming")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-upcoming-sat-1").textContent).toContain("Michelle’s SAT Session with Xavier");
    expect(screen.queryByText(/Finance/i)).toBeNull();
  });

  test("hides checkout for off-platform clients such as Taito", () => {
    mocks.dashboard.data.credits.selfServeSatBooking = false;
    render(<PortalSat />);
    expect(screen.getByTestId("portal-sat-off-platform")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-upcoming")).toBeTruthy();
    expect(screen.queryByTestId("portal-sat-purchase")).toBeNull();
  });
});
