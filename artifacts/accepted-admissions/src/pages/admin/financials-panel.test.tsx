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

  test("shows an empty invoice state when finance data loads with zero invoices", () => {
    mocks.financials.isError = false;
    mocks.financials.data = {
      clients: [],
      products: [],
      invoices: [],
      credits: [],
    };

    render(<AdminFinancialsPanel />);

    expect(screen.getByTestId("empty-financials-invoices")).toBeTruthy();
    expect(screen.queryByTestId("card-financials-unavailable")).toBeNull();
  });
});
