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

  test("leaves expired, unpaid Stripe checkouts out of Recent payments and Invoices", () => {
    const base = { tutorShareCents: 0, platformShareCents: 13000, refundedAmountCents: 0 };
    const invoiceBase = {
      description: "SAT 1 hour with Eunice",
      subtotalCents: 13000,
      discountCents: 0,
      taxCents: 0,
      totalCents: 13000,
      issuerName: "Accepted Admissions",
      issuerEmail: "",
      issuerAddress: "",
      paymentInstructions: "",
      lineItems: [],
    };
    render(
      <FinancialCard
        previewData={{
          ...previewFinancials,
          payments: [
            { ...base, id: "abandoned", amountCents: 13000, status: "canceled", method: "stripe_checkout", productName: "Abandoned Eunice checkout", createdAt: "2026-11-08T17:56:08.000Z" },
            { ...base, id: "paid", amountCents: 13000, status: "paid", method: "stripe_checkout", productName: "Paid Xavier hour", createdAt: "2026-11-01T17:00:00.000Z" },
          ],
          invoices: [
            { ...invoiceBase, id: "inv-abandoned", status: "canceled", provider: "stripe_checkout", description: "Abandoned invoice", createdAt: "2026-11-08T17:56:08.000Z" },
            { ...invoiceBase, id: "inv-paid", status: "paid", provider: "stripe_checkout", description: "Paid invoice", createdAt: "2026-11-01T17:00:00.000Z" },
          ],
        } as never}
        adminPreview
      />,
    );

    expect(screen.queryByText("Abandoned Eunice checkout")).toBeNull();
    expect(screen.getByText("Paid Xavier hour")).toBeTruthy();
    expect(screen.queryByText("Abandoned invoice")).toBeNull();
    expect(screen.getByText("Paid invoice")).toBeTruthy();
  });
});
