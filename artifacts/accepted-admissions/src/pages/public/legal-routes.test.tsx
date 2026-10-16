import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { PortalAuthProvider } from "@/components/portal-auth";

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useClerk: () => ({ addListener: () => () => {}, signOut: vi.fn() }),
  useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: async () => null }),
  Show: ({ children }: { children: React.ReactNode }) => children,
}));

import { Router } from "@/App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string, isSignedIn: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("offline", { status: 503 })),
  );
  const location = memoryLocation({ path });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <WouterRouter hook={location.hook} searchHook={location.searchHook}>
      <QueryClientProvider client={queryClient}>
        <PortalAuthProvider
          value={{
            clerkAvailable: false,
            isLoaded: true,
            isSignedIn,
            reason: null,
          }}
        >
          <Router />
        </PortalAuthProvider>
      </QueryClientProvider>
    </WouterRouter>,
  );
}

describe("public legal routes", () => {
  test("signed-out /privacy is the policy, not the homepage", () => {
    renderAt("/privacy", false);

    expect(screen.getByTestId("privacy-policy-page")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeTruthy();
    expect(screen.queryByTestId("link-home-guidance")).toBeNull();
    expect(screen.queryByTestId("status-not-found")).toBeNull();
    expect(screen.queryByText("Sign in required")).toBeNull();
    expect(document.title).toBe("Privacy Policy | Accepted Admissions");
  });

  test("signed-in visitors can still open /privacy without an auth wall", () => {
    renderAt("/privacy", true);

    expect(screen.getByTestId("privacy-policy-page")).toBeTruthy();
    expect(screen.queryByText("Sign in required")).toBeNull();
    expect(screen.queryByTestId("status-not-found")).toBeNull();
  });

  test("signed-out /terms is the terms, not the homepage", () => {
    renderAt("/terms", false);

    expect(screen.getByTestId("terms-of-service-page")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeTruthy();
    expect(screen.queryByTestId("link-home-guidance")).toBeNull();
    expect(screen.queryByTestId("status-not-found")).toBeNull();
    expect(document.title).toBe("Terms of Service | Accepted Admissions");
  });

  test("the marketing footer links to both pages from the homepage", () => {
    renderAt("/", false);

    expect(screen.getByTestId("link-home-guidance")).toBeTruthy();
    expect(screen.getByTestId("link-footer-privacy").getAttribute("href")).toBe("/privacy");
    expect(screen.getByTestId("link-footer-terms").getAttribute("href")).toBe("/terms");
  });
});
