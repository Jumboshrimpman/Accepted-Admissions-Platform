import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const checkout = { isPending: false, mutate: vi.fn() };

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: false }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useCreatePaymentCheckout: () => checkout,
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  publicApiPath: (path: string) => path,
}));

import SatOfferings from "./sat-offerings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("SAT offer clarity", () => {
  it("shows one API-backed SAT session and explains the signed-out return", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
      id: "offer-1",
      slug: "single-sat-session",
      name: "Xavier Morales SAT tutoring session",
      description: "One focused 60-minute SAT tutoring session with Xavier Morales.",
      durationHours: 1,
      totalPriceCents: 15000,
      effectiveHourlyRateCents: 15000,
    }]), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<SatOfferings />);

    expect(await screen.findByTestId("card-sat-offer-offer-1")).toBeTruthy();
    expect(screen.getByTestId("price-sat-offer-offer-1").textContent).toContain("$150");
    expect(screen.getByTestId("button-sat-checkout-offer-1").textContent).toContain("Sign in to purchase this session");
    expect(screen.getByText("You’ll return to this offer after signing in.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/Xavier/i);
    expect(screen.getByRole("link", { name: "Meet the team" }).getAttribute("href")).toBe("/our-team");
    expect(screen.getByText("60 minutes")).toBeTruthy();
  });

  it("does not invent a replacement when no offer is published", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<SatOfferings />);

    expect(await screen.findByTestId("status-sat-empty")).toBeTruthy();
    expect(screen.getByTestId("link-sat-empty-guidance").getAttribute("href")).toBe("/client-request");
  });
});