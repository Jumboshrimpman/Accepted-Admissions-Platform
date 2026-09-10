import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  financials: {
    data: null as Record<string, unknown> | null,
    isLoading: false,
    isError: true,
    error: { data: { error: "Finance query failed." } },
    refetch: () => mocks.refetch(),
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetAdminFinancialsQueryKey: () => ["/api/admin/financials"],
  getGetAdminOverviewQueryKey: () => ["/api/admin/overview"],
  useGetAdminFinancials: () => mocks.financials,
  useCreateHostedInvoice: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateOfflinePayment: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateCreditAdjustment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateInvoice: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAdminProduct: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAdminProduct: () => ({ mutate: vi.fn(), isPending: false }),
  customFetch: vi.fn(),
}));

import { AdminFinancialsPanel } from "./financials-panel";

afterEach(() => {
  cleanup();
  mocks.refetch.mockReset();
  mocks.financials.data = null;
  mocks.financials.isLoading = false;
  mocks.financials.isError = true;
});

describe("administrator financials panel", () => {
  test("shows an error card with retry and a path back to admin overview", () => {
    render(<AdminFinancialsPanel />);

    expect(screen.getByTestId("card-financials-unavailable")).toBeTruthy();
    expect(screen.getByText("Finance query failed.")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-financials-retry"));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("link-financials-back-admin").getAttribute("href")).toBe("/admin");
  });

  test("hides the retired test SAT product from catalog purchase options", () => {
    mocks.financials.isError = false;
    mocks.financials.data = {
      clients: [],
      products: [
        {
          id: "prod-test",
          slug: "test-sat-hour",
          name: "test",
          description: "Temporary $1 test product",
          durationHours: 1,
          totalPriceCents: 100,
          effectiveHourlyRateCents: 100,
          active: true,
        },
        {
          id: "prod-1",
          slug: "single-sat-session",
          name: "Single SAT Session",
          description: "One prepaid hour",
          durationHours: 1,
          totalPriceCents: 13000,
          effectiveHourlyRateCents: 13000,
          active: true,
        },
      ],
      invoices: [],
      credits: [],
      expectedStripeWebhookUrl: "https://app.acceptedadmissions.org/api/stripe/webhook",
      paymentCreditMismatches: [],
    };

    render(<AdminFinancialsPanel />);

    expect(screen.getByText("Single SAT Session")).toBeTruthy();
    expect(screen.queryByText("test-sat-hour")).toBeNull();
    expect(screen.queryByText("$1.00")).toBeNull();
  });

  test("shows an empty invoice state when finance data loads with zero invoices", () => {
    mocks.financials.isError = false;
    mocks.financials.data = {
      clients: [],
      products: [],
      invoices: [],
      credits: [],
      expectedStripeWebhookUrl: "https://app.acceptedadmissions.org/api/stripe/webhook",
      paymentCreditMismatches: [],
    };

    render(<AdminFinancialsPanel />);

    expect(screen.getByTestId("empty-financials-invoices")).toBeTruthy();
    expect(screen.getByTestId("text-payment-credit-health-ok")).toBeTruthy();
    expect(screen.getByText("https://app.acceptedadmissions.org/api/stripe/webhook")).toBeTruthy();
    expect(screen.queryByTestId("card-financials-unavailable")).toBeNull();
  });

  test("lists paid-but-uncredited payments and offers an idempotent backfill", () => {
    mocks.financials.isError = false;
    mocks.financials.data = {
      clients: [],
      products: [],
      invoices: [],
      credits: [],
      expectedStripeWebhookUrl: "https://app.acceptedadmissions.org/api/stripe/webhook",
      retiredStripeWebhookHosts: ["accepted-admissions-platform.replit.app"],
      paymentCreditMismatches: [
        {
          paymentId: "pay_mismatch",
          clientName: "Owner test",
          clientEmail: "owner@example.invalid",
          productName: "Single SAT Session",
          productSlug: "single-sat-session",
          expectedHours: 1,
          amountCents: 100,
          status: "paid",
          paidAt: new Date().toISOString(),
          reason: "missing_credit",
        },
      ],
    };

    render(<AdminFinancialsPanel />);

    expect(screen.getByTestId("list-payment-credit-mismatches")).toBeTruthy();
    expect(screen.getByText("Single SAT Session")).toBeTruthy();
    expect(screen.getByTestId("button-backfill-paid-credits")).toBeTruthy();
    expect(screen.queryByTestId("text-payment-credit-health-ok")).toBeNull();
  });
});
