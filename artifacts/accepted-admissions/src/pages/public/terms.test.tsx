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
  it("covers the service terms and leaves cancellation and governing law as placeholders", () => {
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
    expect(screen.getByText(/prepaid hourly credits purchased through Stripe/)).toBeTruthy();
    expect(screen.getByText(/does not store card numbers/i)).toBeTruthy();
    expect(screen.getByText(/does not guarantee admission/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Acceptable use" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Intellectual property" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Limitation of liability" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Changes to these terms" })).toBeTruthy();

    const cancellation = screen.getByTestId("terms-cancellation-placeholder");
    expect(cancellation.textContent).toMatch(/Placeholder — owner to complete/);
    expect(cancellation.textContent).toMatch(/not a promise that a credit will be returned/);
    expect(cancellation.textContent).not.toMatch(/Virginia|24 hours|\$\d/);

    const governingLaw = screen.getByTestId("terms-governing-law-placeholder");
    expect(governingLaw.textContent).toMatch(/Placeholder — owner to complete/);
    expect(governingLaw.textContent).toMatch(/do not name a governing law/);
    expect(governingLaw.textContent).not.toMatch(/Virginia|Delaware|California|New York/);

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
