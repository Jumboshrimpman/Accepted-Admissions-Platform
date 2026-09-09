import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter, useRoute } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { PortalAuthProvider } from "@/components/portal-auth";

const currentUser = vi.hoisted(() => ({
  data: {
    id: "user-1",
    role: "tutor" as "tutor" | "administrator",
    displayName: "Xavier Morales",
    title: "Tutor",
    avatarUrl: null,
  },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  useClerk: () => ({ addListener: () => () => {}, signOut: vi.fn() }),
  useUser: () => ({ user: { fullName: "Xavier Morales", firstName: "Xavier", imageUrl: "" } }),
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock("@/components/shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    setBaseUrl: vi.fn(),
    useGetCurrentUser: () => currentUser,
    customFetch: mocks.customFetch,
  };
});

import { Router } from "@/App";

afterEach(() => {
  cleanup();
  currentUser.data.role = "tutor";
  mocks.customFetch.mockReset();
});

function MatchProbe({ pattern }: { pattern: string }) {
  const [match] = useRoute(pattern);
  return <div data-testid={`wouter-match-${pattern}`}>{String(match)}</div>;
}

function renderRouter(path: string) {
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
            isSignedIn: true,
            reason: null,
          }}
        >
          <Router />
        </PortalAuthProvider>
      </QueryClientProvider>
    </WouterRouter>,
  );
}

function stubTutorApis() {
  mocks.customFetch.mockImplementation(async (path: string) => {
    if (path === "/api/tutor/profile") {
      return {
        id: "profile-1",
        email: "xavier@example.invalid",
        name: "Xavier Morales",
        title: "SAT Tutor",
        photoUrl: null,
        photoAltText: null,
        biography: null,
        subjects: ["SAT"],
        linkedinUrl: null,
        publicApproved: false,
        active: true,
        bookingEligible: true,
      };
    }
    if (path === "/api/tutor/curriculum") {
      return {
        programs: [],
        students: [],
        sessions: [],
        quizzes: [],
        libraryAssets: [],
        satBankCollections: [],
      };
    }
    throw new Error(`Unexpected request: ${path}`);
  });
}

describe("tutor workspace routes", () => {
  test("wouter treats /tutor* as regex r*, so /tutor/profile never reaches a nested Switch", () => {
    const location = memoryLocation({ path: "/tutor/profile" });
    render(
      <WouterRouter hook={location.hook} searchHook={location.searchHook}>
        <MatchProbe pattern="/tutor*" />
        <MatchProbe pattern="/tutor/*?" />
        <MatchProbe pattern="/tutor/profile" />
      </WouterRouter>,
    );

    expect(screen.getByTestId("wouter-match-/tutor*").textContent).toBe("false");
    expect(screen.getByTestId("wouter-match-/tutor/*?").textContent).toBe("true");
    expect(screen.getByTestId("wouter-match-/tutor/profile").textContent).toBe("true");
  });

  test.each([
    { role: "tutor" as const, path: "/tutor/profile", page: "tutor-profile-page" },
    { role: "tutor" as const, path: "/tutor/curriculum", page: "tutor-curriculum-page" },
    { role: "administrator" as const, path: "/tutor/profile", page: "tutor-profile-page" },
    { role: "administrator" as const, path: "/tutor/curriculum", page: "tutor-curriculum-page" },
  ])("renders the real $page for a $role at $path", async ({ role, path, page }) => {
    currentUser.data.role = role;
    stubTutorApis();
    renderRouter(path);

    expect(await screen.findByTestId(page)).toBeTruthy();
    expect(screen.queryByTestId("status-not-found")).toBeNull();
    await waitFor(() => {
      expect(screen.queryByText("This page is not available.")).toBeNull();
    });
  });
});
