import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const checkout = { isPending: false, mutate: vi.fn() };
const authState = vi.hoisted(() => ({ isSignedIn: false }));
const userState = vi.hoisted(() => ({
  data: undefined as { role: "administrator" | "tutor" | "student" | "viewer" } | undefined,
  isLoading: false,
  error: null as unknown,
}));

vi.mock("@/components/portal-auth", () => ({
  usePortalAuth: () => authState,
}));

vi.mock("@workspace/api-client-react", () => ({
  useCreatePaymentCheckout: () => checkout,
  getGetCurrentUserQueryKey: () => ["/api/me"],
  useGetCurrentUser: () => userState,
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  publicApiPath: (path: string) => path,
  fetchPublicJson: async (path: string) => {
    const response = await fetch(path);
    return response.json();
  },
}));

import SatOfferings from "./sat-offerings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  authState.isSignedIn = false;
  userState.data = undefined;
  userState.isLoading = false;
  userState.error = null;
  checkout.mutate.mockReset();
});

describe("SAT offer clarity", () => {
  it("shows API-backed SAT session offers and explains the signed-out return", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      if (String(path).includes("/api/public/content/sat")) {
        return new Response(JSON.stringify({
          title: "Prepaid SAT session credits.",
          seoTitle: "SAT tutoring | Accepted Admissions",
          seoDescription: "Explore prepaid SAT session credits.",
          body: {
            heroLead: "Purchase a single hour or a ten-hour package at $130 per credit with our SAT tutors.",
            offersIntro: "Use credits anytime on our SAT tutors’ available calendar.",
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify([
      {
        id: "offer-1",
        slug: "single-sat-session",
        name: "Single SAT Session",
        description:
          "One prepaid 60-minute SAT tutoring credit. Book any open hour with our SAT tutors.",
        durationHours: 1,
        totalPriceCents: 13000,
        effectiveHourlyRateCents: 13000,
      },
      {
        id: "offer-10",
        slug: "ten-sat-session-package",
        name: "Ten SAT Session Package",
        description:
          "Ten prepaid 60-minute SAT tutoring credits at $130/hour. Use them anytime on our SAT tutors’ available calendar.",
        durationHours: 10,
        totalPriceCents: 130000,
        effectiveHourlyRateCents: 13000,
      },
    ]), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    render(<SatOfferings />);

    expect(await screen.findByTestId("card-sat-offer-offer-1")).toBeTruthy();
    expect(screen.getByTestId("card-sat-offer-offer-10")).toBeTruthy();
    expect(screen.getByTestId("price-sat-offer-offer-1").textContent).toContain("$130");
    expect(screen.getByTestId("price-sat-offer-offer-10").textContent).toContain("$1,300");
    expect(screen.getByTestId("button-sat-checkout-offer-1").textContent).toContain("Sign in to purchase this session");
    expect(screen.getAllByText("You’ll return to this offer after signing in.").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/Xavier/i);
    expect(screen.queryByText(/Xavier or Eunice/i)).toBeNull();
    expect(screen.getByText(/our SAT tutors/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Meet the team" }).getAttribute("href")).toBe("/our-team");
    expect(screen.getByText(/campus tours, college advising/i)).toBeTruthy();
    expect(screen.getByText(/financial aid for SAT tutoring is considered case by case/i)).toBeTruthy();
    expect(screen.getByText("1 credit")).toBeTruthy();
    expect(screen.getByText("10 credits")).toBeTruthy();
  });

  it("does not invent a replacement when no offer is published", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<SatOfferings />);

    expect(await screen.findByTestId("status-sat-empty")).toBeTruthy();
    expect(screen.getByTestId("link-sat-empty-guidance").getAttribute("href")).toBe("/client-request");
  });

  it("keeps non-student accounts out of checkout and gives administrators a next step", async () => {
    authState.isSignedIn = true;
    userState.data = { role: "administrator" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
      id: "offer-1",
      slug: "single-sat-session",
      name: "SAT session",
      description: "Approved session",
      durationHours: 1,
      totalPriceCents: 13000,
      effectiveHourlyRateCents: 13000,
    }]), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<SatOfferings />);

    const button = await screen.findByTestId("button-sat-checkout-offer-1");
    expect(button.textContent).toContain("Student checkout unavailable");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("link", { name: "Open administrator workspace" }).getAttribute("href")).toBe("/admin");
    fireEvent.click(button);
    expect(checkout.mutate).not.toHaveBeenCalled();
  });

  it("starts checkout only after a signed-in student account is confirmed", async () => {
    authState.isSignedIn = true;
    userState.data = { role: "student" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
      id: "offer-1",
      slug: "single-sat-session",
      name: "SAT session",
      description: "Approved session",
      durationHours: 1,
      totalPriceCents: 13000,
      effectiveHourlyRateCents: 13000,
    }]), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<SatOfferings />);

    const button = await screen.findByTestId("button-sat-checkout-offer-1");
    fireEvent.click(button);
    expect(checkout.mutate).toHaveBeenCalledWith(
      { data: { productId: "offer-1" } },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });
});