import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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

import SatOfferings, { satPricingSignInHref } from "./sat-offerings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  authState.isSignedIn = false;
  userState.data = undefined;
  userState.isLoading = false;
  userState.error = null;
});

describe("SAT public page does not publish prices", () => {
  it("sends signed-out visitors to sign-in instead of showing SAT prices or checkout", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      if (String(path).includes("/api/public/content/sat")) {
        return new Response(JSON.stringify({
          title: "Prepaid SAT session credits.",
          seoTitle: "SAT tutoring | Accepted Admissions",
          seoDescription: "SAT tutoring with Accepted Admissions.",
          body: {
            heroLead: "One-on-one SAT tutoring with the Accepted Admissions team. Sign in to your client portal to view current pricing.",
            offersIntro: "SAT booking and payment stay inside the signed-in client portal.",
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected public fetch: ${path}`);
    }));

    render(<SatOfferings />);

    expect(await screen.findByTestId("card-sat-signin-required")).toBeTruthy();
    const signIn = screen.getByTestId("link-sat-pricing-signin");
    expect(signIn.getAttribute("href")).toBe("/login?returnTo=%2Fportal%2Fsat");
    expect(signIn.textContent).toMatch(/sign in to view SAT pricing/i);
    expect(screen.getByTestId("button-sat-signin-for-pricing").textContent).toMatch(/sign in to view SAT pricing/i);
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/Xavier/i);
    expect(screen.queryByText(/Xavier or Eunice/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Meet the team" }).getAttribute("href")).toBe("/our-team");
    expect(screen.getByText(/campus tours, college advising/i)).toBeTruthy();
    expect(screen.getByText(/financial aid for SAT tutoring is considered case by case/i)).toBeTruthy();
    expect(screen.queryByTestId("card-sat-offer-offer-1")).toBeNull();
    expect(screen.queryByText(/\$130/)).toBeNull();
    expect(screen.queryByText(/\$1,300/)).toBeNull();
    expect(screen.queryByText(/\$1\b/)).toBeNull();
    expect(screen.queryByText(/^test$/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /checkout/i })).toBeNull();
    expect(screen.queryByText(/continue to secure checkout/i)).toBeNull();
  });

  it("does not fetch the SAT product catalog on the public page", async () => {
    const fetchMock = vi.fn(async (path: string) => {
      if (String(path).includes("/api/public/content/sat")) {
        return new Response(JSON.stringify({
          title: "SAT tutoring",
          body: { heroLead: "Sign in to view pricing.", offersIntro: "Payment stays in the portal." },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected public fetch: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SatOfferings />);
    await screen.findByTestId("card-sat-signin-required");

    expect(fetchMock.mock.calls.some(([path]) => String(path).includes("/api/public/products"))).toBe(false);
  });

  it("points a signed-in student at the portal instead of public checkout", async () => {
    authState.isSignedIn = true;
    userState.data = { role: "student" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      title: "SAT tutoring",
      body: { heroLead: "Sign in to view pricing.", offersIntro: "Payment stays in the portal." },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<SatOfferings />);

    expect(await screen.findByTestId("link-sat-stay-in-portal")).toBeTruthy();
    expect(screen.getByTestId("link-sat-pricing-signin").getAttribute("href")).toBe("/portal/sat");
    expect(screen.getByTestId("link-sat-pricing-signin").textContent).toMatch(/open SAT book and pay/i);
    expect(screen.queryByText(/\$130/)).toBeNull();
    expect(screen.queryByRole("button", { name: /checkout/i })).toBeNull();
  });
});

describe("SAT payment URL sign-in", () => {
  it("sends payment URLs through sign-in first", () => {
    expect(satPricingSignInHref("/portal/sat")).toBe("/login?returnTo=%2Fportal%2Fsat");
  });
});
