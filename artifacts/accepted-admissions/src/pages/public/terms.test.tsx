import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import TermsOfService, { TERMS_DESCRIPTION, TERMS_TITLE } from "./terms";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Terms of Service", () => {
  it("covers refunds, the 24-hour reschedule rule, and New Jersey governing law", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("offline", { status: 503 })),
    );
    const location = memoryLocation({ path: "/terms" });
    render(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <TermsOfService />
      </Router>,
    );

    expect(screen.getByTestId("terms-of-service-page")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeTruthy();
    expect(document.title).toBe(TERMS_TITLE);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      TERMS_DESCRIPTION,
    );
    expect(screen.getByText(/Effective October 16, 2026/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Services" })).toBeTruthy();
    expect(screen.getByText(/provided by Clerk/)).toBeTruthy();
    const bookings = screen.getByRole("heading", { name: "Bookings and payments" }).closest("section");
    expect(bookings?.textContent).toMatch(/prepaid hourly credits purchased through Stripe/);
    expect(bookings?.textContent).toMatch(/available only to new clients/);
    expect(bookings?.textContent).toMatch(/before that client’s first tutoring session, using the refund request form/);
    expect(bookings?.textContent).toMatch(/no refunds after the first session, including later credit purchases/);
    expect(bookings?.textContent).toMatch(/Unused credits carry over when a session is rescheduled/);
    expect(bookings?.textContent).toMatch(/Rescheduling is subject to tutor availability/);
    expect(bookings?.textContent).toMatch(/Cancelling at least 24 hours in advance through the portal keeps the session credit/);
    expect(bookings?.textContent).toMatch(/A cancellation with less than 24 hours’ notice, or a no-show, uses the session credit/);
    expect(bookings?.textContent).not.toMatch(/Rescheduling or cancellation needs at least 24 hours/);
    expect(screen.getByText(/does not store card numbers/i)).toBeTruthy();
    expect(screen.getByText(/does not guarantee admission/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Acceptable use" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Intellectual property" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Limitation of liability" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Changes to these terms" })).toBeTruthy();

    const page = screen.getByTestId("terms-of-service-page");
    expect(page.textContent).not.toMatch(/Placeholder — owner to complete/);
    expect(page.textContent).not.toMatch(/arbitration|class action|class-action/i);

    const cancellation = screen.getByRole("heading", { name: "Cancellation, rescheduling, and refunds" }).closest("section");
    expect(cancellation?.textContent).toMatch(/only to new clients/);
    expect(cancellation?.textContent).toMatch(/using the refund request form/);
    expect(cancellation?.textContent).toMatch(/first tutoring session has taken place/);
    expect(cancellation?.textContent).toMatch(/all purchases are non-refundable/);
    expect(cancellation?.textContent).toMatch(/later credit purchases/);
    expect(cancellation?.textContent).toMatch(/Unused credits remain available for rescheduled sessions/);
    expect(cancellation?.textContent).toMatch(/Rescheduling is subject to tutor availability/);
    expect(cancellation?.textContent).toMatch(/cancel at least 24 hours in advance through the portal/);
    expect(cancellation?.textContent).toMatch(
      /A cancellation with less than 24 hours’ notice, or a no-show, uses the session credit/,
    );
    expect(cancellation?.textContent).not.toMatch(/discretion/);
    expect(cancellation?.textContent).not.toMatch(/reschedule or cancel at least 24 hours/);
    expect(cancellation?.textContent).toMatch(/rights consumers have under applicable law/);

    const governingLaw = screen.getByRole("heading", { name: "Governing law" }).closest("section");
    expect(governingLaw?.textContent).toMatch(/laws of the State of New Jersey/);
    expect(governingLaw?.textContent).toMatch(/without regard to conflict-of-law principles/);
    expect(governingLaw?.textContent).toMatch(/state and federal courts located in New Jersey/);
    expect(governingLaw?.textContent).toMatch(/personal jurisdiction/);
    expect(governingLaw?.textContent).toMatch(/30 days after written notice/);

    expect(screen.getByRole("heading", { name: "Severability" }).closest("section")?.textContent).toMatch(
      /the rest of the terms still apply/,
    );

    expect(screen.getByTestId("link-terms-contact").getAttribute("href")).toBe(
      "mailto:admin@acceptedadmissions.org",
    );
    expect(
      screen.getAllByRole("link", { name: "Privacy Policy" }).some(
        (link) => link.getAttribute("href") === "/privacy",
      ),
    ).toBe(true);
    expect(screen.queryByText(/Sign in required/)).toBeNull();
  });
});
