import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PORTAL_SAT_PURCHASE_HREF } from "@/lib/portal-sat";
import {
  PAYMENT_CONFIRMING_TITLE,
  PAYMENT_GRANTED_TITLE,
} from "@/lib/portal-sat-payment";

const mocks = vi.hoisted(() => ({
  location: "/portal/sat",
  setLocation: vi.fn(),
  remainingHours: 0,
  currentUser: {
    data: { role: "student" as "student" | "tutor" | "administrator" | "viewer" },
    isLoading: false,
  },
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
          durationMinutes: 60,
          tutor: { name: "Xavier Morales" },
        },
        {
          id: "sat-tokyo",
          subject: "SAT",
          title: "Taito SAT with Eunice",
          dateTime: "2026-10-02T12:00:00.000Z",
          timezone: "Asia/Tokyo",
          durationMinutes: 60,
          tutor: { name: "Eunice Chon" },
        },
        {
          id: "sat-cancelled",
          subject: "SAT",
          title: "SAT capability test — Xavier",
          dateTime: "2026-09-07T20:00:00.000Z",
          timezone: "America/New_York",
          durationMinutes: 60,
          bookingStatus: "cancelled",
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
  useGetCurrentUser: () => mocks.currentUser,
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

const defaultUpcomingSessions = mocks.dashboard.data.upcomingSessions;

afterEach(() => {
  cleanup();
  mocks.dashboard.data.credits.selfServeSatBooking = true;
  mocks.dashboard.data.credits.remainingHours = 0;
  mocks.dashboard.data.upcomingSessions = defaultUpcomingSessions;
  mocks.location = PORTAL_SAT_PURCHASE_HREF;
  mocks.remainingHours = 0;
  mocks.currentUser.data = { role: "student" };
  mocks.currentUser.isLoading = false;
  mocks.dashboard.data.user.role = "student";
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
            slug: "single-sat-session",
            name: "Single SAT session",
            description: "One prepaid hour",
            durationHours: 1,
            totalPriceCents: 13000,
            effectiveHourlyRateCents: 13000,
          },
          {
            id: "prod-10",
            slug: "ten-sat-session-package",
            name: "Ten SAT Session Package",
            description: "Ten prepaid hours",
            durationHours: 10,
            totalPriceCents: 130000,
            effectiveHourlyRateCents: 13000,
          },
        ],
      };
    }),
  );
});

describe("portal SAT book/pay", () => {
  test("keeps purchase and booking inside the portal shell", async () => {
    render(<PortalSat />);
    expect(screen.getByTestId("portal-sat-page")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "SAT book and pay" })).toBeTruthy();
    expect(screen.getByTestId("portal-sat-purchase")).toBeTruthy();
    expect(await screen.findByTestId("portal-sat-offer-prod-1")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-offer-prod-1").textContent).toContain("Single SAT session");
    expect(screen.getByTestId("portal-sat-offer-prod-1").textContent).toContain("$130");
    expect(screen.getByTestId("portal-sat-offer-prod-1").textContent).toContain("1 credit");
    expect(screen.getByTestId("portal-sat-offer-prod-10").textContent).toContain("$1,300");
    expect(screen.getByTestId("portal-sat-offer-prod-10").textContent).toContain("10 credits");
    expect(screen.queryByTestId("portal-sat-offer-prod-test")).toBeNull();
    expect(screen.queryByText(/^test$/)).toBeNull();
    expect(screen.getByTestId("portal-sat-upcoming")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-upcoming-sat-1").textContent).toContain("Michelle’s SAT Session with Xavier");
    expect(screen.getByTestId("portal-sat-upcoming-sat-1").textContent).toMatch(/12:00–1:00 PM America\/New_York/);
    expect(screen.getByTestId("portal-sat-upcoming-sat-tokyo").textContent).toMatch(/9:00–10:00 PM JST/);
    expect(screen.queryByTestId("portal-sat-upcoming-sat-cancelled")).toBeNull();
    expect(screen.queryByText("Cancelled SAT Session")).toBeNull();
    expect(screen.queryByText("SAT capability test — Xavier")).toBeNull();
    expect(screen.queryByText(/Finance/i)).toBeNull();
  });

  test("hides checkout when a tutor opens /portal/sat directly", () => {
    mocks.currentUser.data = { role: "tutor" };
    mocks.dashboard.data.user.role = "tutor";
    render(<PortalSat />);
    expect(screen.getByTestId("portal-sat-access-denied")).toBeTruthy();
    expect(screen.getByText("SAT booking is for students")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open tutor workspace" }).getAttribute("href")).toBe(
      "/tutor",
    );
    expect(screen.queryByTestId("portal-sat-page")).toBeNull();
    expect(screen.queryByTestId("portal-sat-purchase")).toBeNull();
    expect(screen.queryByRole("button", { name: /secure checkout/i })).toBeNull();
    expect(screen.queryByText("Purchase SAT hours")).toBeNull();
    expect(screen.queryByText("Book a prepaid SAT session")).toBeNull();
  });

  test("dedupes duplicate SAT meetings and collapses past the next three", () => {
    const dates = ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"];
    mocks.dashboard.data.upcomingSessions = dates.flatMap((dateKey) => [
      {
        id: `tokyo-${dateKey}`,
        subject: "SAT",
        title: `Taito SAT ${dateKey}`,
        dateTime: `${dateKey}T12:00:00.000Z`,
        timezone: "Asia/Tokyo",
        durationMinutes: 60,
        tutor: { id: "eunice", name: "Eunice Chon" },
      },
      {
        id: `eastern-${dateKey}`,
        subject: "SAT",
        title: `Taito SAT ${dateKey} ET`,
        dateTime: `${dateKey}T16:00:00.000Z`,
        timezone: "America/New_York",
        durationMinutes: 60,
        tutor: { id: "eunice", name: "Eunice Chon" },
      },
    ]);
    render(<PortalSat />);
    expect(screen.getByTestId("portal-sat-upcoming-tokyo-2026-10-02")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-upcoming-tokyo-2026-10-09")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-upcoming-tokyo-2026-10-16")).toBeTruthy();
    expect(screen.queryByTestId("portal-sat-upcoming-eastern-2026-10-02")).toBeNull();
    expect(screen.queryByTestId("portal-sat-upcoming-tokyo-2026-10-23")).toBeNull();
    fireEvent.click(screen.getByTestId("session-list-show-more"));
    expect(screen.getByTestId("portal-sat-upcoming-tokyo-2026-10-23")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-upcoming-tokyo-2026-10-30")).toBeTruthy();
    expect(screen.queryByTestId("portal-sat-upcoming-eastern-2026-10-30")).toBeNull();
  });

  test("does not surface a retired test SAT product even if the catalog payload includes it", async () => {
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
              id: "prod-test",
              slug: "test-sat-hour",
              name: "test",
              description: "Temporary $1 test product that grants 1 SAT hour.",
              durationHours: 1,
              totalPriceCents: 100,
              effectiveHourlyRateCents: 100,
            },
            {
              id: "prod-1",
              slug: "single-sat-session",
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
    render(<PortalSat />);
    expect(await screen.findByTestId("portal-sat-offer-prod-1")).toBeTruthy();
    expect(screen.queryByTestId("portal-sat-offer-prod-test")).toBeNull();
    expect(screen.queryByText(/^test$/)).toBeNull();
    expect(screen.getByTestId("portal-sat-offer-prod-1").textContent).toContain("$130");
  });

  test("hides checkout for off-platform clients such as Taito", () => {
    mocks.dashboard.data.credits.selfServeSatBooking = false;
    render(<PortalSat />);
    expect(screen.getByTestId("portal-sat-off-platform")).toBeTruthy();
    expect(screen.getByTestId("portal-sat-upcoming")).toBeTruthy();
    expect(screen.queryByTestId("portal-sat-purchase")).toBeNull();
  });

  test("checkout return does not claim credits are ready while the ledger is still 0", async () => {
    mocks.location = `${PORTAL_SAT_PURCHASE_HREF}?payment=success`;
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
    mocks.location = `${PORTAL_SAT_PURCHASE_HREF}?payment=success`;
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
