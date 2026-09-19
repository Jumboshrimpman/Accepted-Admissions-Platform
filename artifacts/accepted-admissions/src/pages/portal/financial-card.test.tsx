import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetFinancialsQueryKey: () => ["financials"],
  useGetFinancials: () => ({
    data: null,
    isLoading: false,
  }),
}));

import { FinancialCard } from "./financial-card";

const previewFinancials = {
  readOnly: true,
  providerStatus: "connected" as const,
  purchasedHours: 1,
  usedHours: 0,
  remainingHours: 1,
  invoices: [],
  payments: [],
  credits: [],
};

afterEach(() => cleanup());

describe("SAT session payment and receipts", () => {
  test("hides the section for off-platform clients such as Taito", () => {
    const { container } = render(
      <FinancialCard previewData={previewFinancials} adminPreview offPlatformBilling />,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText("SAT session payment and receipts")).toBeNull();
    expect(screen.queryByText("Your SAT session payment")).toBeNull();
    expect(screen.queryByText("Recent payments")).toBeNull();
  });

  test("keeps the section visible for self-serve clients such as Michelle", () => {
    render(<FinancialCard previewData={previewFinancials} adminPreview />);

    expect(screen.getByText("SAT session payment and receipts")).toBeTruthy();
    expect(screen.getByText("Recent payments")).toBeTruthy();
    expect(screen.getByText("1 hour remaining")).toBeTruthy();
  });
});
