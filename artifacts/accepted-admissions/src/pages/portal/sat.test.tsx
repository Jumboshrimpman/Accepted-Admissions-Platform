import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PORTAL_SAT_HREF } from "@/lib/portal-sat";
import {
  PAYMENT_CONFIRMING_TITLE,
  PAYMENT_GRANTED_TITLE,
} from "@/lib/portal-sat-payment";

const mocks = vi.hoisted(() => ({
  location: "/portal/sat",
  setLocation: vi.fn(),
  remainingHours: 0,
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
  useLocation: () => [mocks.location, mocks.setLocation],
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import PortalSat from "./sat";

afterEach(() => {
  cleanup();
  mocks.dashboard.data.credits.selfServeSatBooking = true;
  mocks.dashboard.data.credits.remainingHours = 0;
  mocks.location = PORTAL_SAT_HREF;
  mocks.remainingHours = 0;
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/credits")) {
        return {
          ok: true,
          json: async () => ({ remainingHours: mocks.remainingHours }),
        };
      }
      return {
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
      };
    }),
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

  test("checkout return does not claim credits are ready while the ledger is still 0", async () => {
    mocks.location = `${PORTAL_SAT_HREF}?payment=success`;
    mocks.dashboard.data.credits.remainingHours = 0;
    mocks.remainingHours = 0;
    render(<PortalSat />);
    const banner = await screen.findByTestId("portal-sat-payment-success");
    expect(banner.getAttribute("data-credit-state")).toBe("confirming");
    expect(banner.textContent).toContain(PAYMENT_CONFIRMING_TITLE);
    expect(banner.textContent).toMatch(/signed Stripe webhook/i);
    expect(banner.textContent).not.toMatch(/credits are ready/i);
    expect(banner.textContent).not.toMatch(/You have 0 prepaid hour/);
  });

  test("says Stripe confirmed only after the credit ledger increases", async () => {
    mocks.location = `${PORTAL_SAT_HREF}?payment=success`;
    mocks.dashboard.data.credits.remainingHours = 0;
    mocks.remainingHours = 1;
    render(<PortalSat />);
    await waitFor(() => {
      const banner = screen.getByTestId("portal-sat-payment-success");
      expect(banner.getAttribute("data-credit-state")).toBe("granted");
      expect(banner.textContent).toContain(PAYMENT_GRANTED_TITLE);
      expect(banner.textContent).toMatch(/1 prepaid hour/);
    });
  });
});
