import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import PrivacyPolicy, {
  GOOGLE_API_USER_DATA_POLICY_URL,
  GOOGLE_LIMITED_USE_SENTENCE,
  PRIVACY_DESCRIPTION,
  PRIVACY_TITLE,
} from "./privacy";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.querySelectorAll('link[rel="canonical"]').forEach((element) => element.remove());
});

describe("Privacy Policy", () => {
  it("is a public page with the Google Limited Use sentence and required topics", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("offline", { status: 503 })),
    );
    const location = memoryLocation({ path: "/privacy" });
    render(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <PrivacyPolicy />
      </Router>,
    );

    expect(screen.getByTestId("privacy-policy-page")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" }).textContent).toBe(
      "Privacy Policy",
    );
    expect(document.title).toBe(PRIVACY_TITLE);
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      PRIVACY_DESCRIPTION,
    );
    expect(screen.getAllByText(/Effective October 16, 2026/).length).toBeGreaterThan(0);
    expect(screen.getByText(/sign in with Clerk/i)).toBeTruthy();
    expect(screen.getByText(/SAT scores, GPA, school, and target universities/)).toBeTruthy();
    expect(screen.getByText(/We do not store your card numbers/)).toBeTruthy();
    expect(screen.getByText(/Stripe processes the card payment/)).toBeTruthy();
    expect(screen.getByText(/explicit consent/i)).toBeTruthy();
    expect(screen.getByText(/used solely for that client/i)).toBeTruthy();
    expect(screen.getByText(/We never sell personal information/)).toBeTruthy();
    expect(screen.getByText(/parent or guardian consents/i)).toBeTruthy();
    expect(screen.getByTestId("privacy-google-limited-use").textContent).toBe(
      GOOGLE_LIMITED_USE_SENTENCE,
    );
    const policyLink = screen.getByRole("link", { name: /Google API Services User Data Policy/i });
    expect(policyLink.getAttribute("href")).toBe(GOOGLE_API_USER_DATA_POLICY_URL);
    expect(screen.getByText(/read free\/busy availability/i)).toBeTruthy();
    expect(screen.getByText(/not used for advertising/i)).toBeTruthy();
    expect(screen.getByText(/not used to train AI models/i)).toBeTruthy();
    expect(screen.getByText(/Tokens are stored encrypted/)).toBeTruthy();
    expect(screen.getByTestId("link-privacy-contact").getAttribute("href")).toBe(
      "mailto:admin@acceptedadmissions.org",
    );
    expect(screen.queryByText(/Sign in required/)).toBeNull();
    expect(screen.queryByTestId("status-not-found")).toBeNull();
  });
});
