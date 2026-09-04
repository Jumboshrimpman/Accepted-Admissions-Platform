import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  currentUser: {
    data: { id: "admin-1", role: "administrator" as const },
    isLoading: false,
    error: null,
  },
  customFetch: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignIn: () => null,
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useClerk: () => ({ addListener: () => () => undefined }),
}));

vi.mock("@/lib/clerk-publishable-key", () => ({
  resolveClerkPublishableKey: () => ({
    ok: true,
    publishableKey: "pk_test_public-content-route",
  }),
  clerkLoadFailureCopy: () => ({
    title: "Sign-in could not load Clerk",
    body: "Clerk script failed.",
    failedHost: "clerk.acceptedadmissions.org",
    scriptUrl: "https://clerk.acceptedadmissions.org/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: mocks.customFetch,
  getGetCurrentUserQueryKey: () => ["current-user"],
  setBaseUrl: vi.fn(),
  useGetCurrentUser: () => mocks.currentUser,
}));

vi.mock("@/components/shell", () => ({
  Shell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import Root from "../../App";

afterEach(() => {
  cleanup();
  mocks.customFetch.mockReset();
  window.history.pushState({}, "", "/");
});

describe("administrator public content route", () => {
  test("renders the editor at /admin/content instead of the 404 page", async () => {
    mocks.customFetch.mockImplementation(async (path: string) => {
      if (path === "/api/admin/tutors") return [];
      if (path === "/api/admin/public-content") {
        return [
          {
            id: "team-content",
            slug: "our-team",
            title: "Meet Our Team",
            seoTitle: null,
            seoDescription: null,
            status: "draft",
            body: { intro: "Choose the expert best fit for you." },
          },
          {
            id: "success-content",
            slug: "past-success",
            title: "Student Stories",
            seoTitle: null,
            seoDescription: null,
            status: "draft",
            body: {},
          },
        ];
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    window.history.pushState({}, "", "/admin/content");

    render(<Root />);

    expect(
      await screen.findByRole("heading", {
        name: "Public team and student-story content",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("404")).toBeNull();
  });
});