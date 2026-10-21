import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { BillingHistoryDisclosure, formatBillingTimestamp } from "./billing-history";

describe("billing history disclosure", () => {
  afterEach(() => {
    cleanup();
  });

  test("stays collapsed and shows an empty state", () => {
    render(<BillingHistoryDisclosure payments={[]} />);
    const billing = screen.getByTestId("billing-history") as HTMLDetailsElement;
    expect(billing.open).toBe(false);
    expect(billing.textContent).toContain("Billing history (0 payments)");
    fireEvent.click(billing.querySelector("summary")!);
    expect(billing.open).toBe(true);
    expect(screen.getByTestId("billing-history-empty").textContent).toContain(
      "No payments or purchases are on file.",
    );
  });

  test("lists a paid Nika hour in Eastern Time when expanded", () => {
    render(
      <BillingHistoryDisclosure
        payments={[
          {
            id: "pay-nika",
            purchasedAt: "2026-10-20T16:00:00.000Z",
            label: "College Consulting hour with Nika",
            service: "College Consulting",
            tutorName: "Nika",
            hours: 1,
            sessionTitle: "Neel’s College Consulting Session with Nika",
            sessionStart: "2026-10-20T16:00:00.000Z",
            amountCents: 10000,
            status: "paid",
          },
        ]}
      />,
    );
    const billing = screen.getByTestId("billing-history") as HTMLDetailsElement;
    expect(billing.open).toBe(false);
    expect(formatBillingTimestamp("2026-10-20T16:00:00.000Z")).toBe("Oct 20, 2026, 12:00 PM ET");
    fireEvent.click(billing.querySelector("summary")!);
    const row = screen.getByTestId("billing-history-pay-nika");
    expect(row.textContent).toContain("Oct 20, 2026, 12:00 PM ET");
    expect(row.textContent).toContain("College Consulting hour with Nika");
    expect(row.textContent).toContain("College Consulting · Nika · 1 hour");
    expect(row.textContent).toContain("Neel’s College Consulting Session with Nika");
    expect(row.textContent).toContain("$100.00");
    expect(row.textContent).toContain("paid");
    expect(row.textContent?.toLowerCase()).not.toContain("stripe");
  });
});
