import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CLERK_SIGNOUT_GRACE_MS, resetClerkSessionGateForTests } from "@/lib/clerk-session-gate";
import { clerkSessionTokens, resetNotedClerkUserForTests } from "@/lib/clerk-session-token";
import {
  ClerkPortalAuthBridge,
  PortalAuthProvider,
  SignedIn,
  SignedOut,
  WhenSignedIn,
  WhenSignedOut,
} from "./portal-auth";

const clerkAuth = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: false as boolean,
  userId: null as string | null,
  sessionId: null as string | null,
  getToken: vi.fn(async () => null as string | null),
}));

vi.mock("@clerk/react", () => ({
  useAuth: () => clerkAuth,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetClerkSessionGateForTests();
  resetNotedClerkUserForTests();
  clerkSessionTokens.clear();
  clerkAuth.isLoaded = true;
  clerkAuth.isSignedIn = false;
  clerkAuth.userId = null;
  clerkAuth.sessionId = null;
});

describe("portal auth visibility", () => {
  it("keeps signed-out actions visible while Clerk is still loading", () => {
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: false,
          isSignedIn: false,
          reason: null,
        }}
      >
        <WhenSignedOut>Sign in</WhenSignedOut>
        <WhenSignedIn>Open portal</WhenSignedIn>
      </PortalAuthProvider>,
    );

    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.queryByText("Open portal")).toBeNull();
  });

  it("keeps signed-out actions visible when Clerk is unavailable", () => {
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: false,
          isLoaded: true,
          isSignedIn: false,
          reason: "missing",
        }}
      >
        <WhenSignedOut>Sign in</WhenSignedOut>
        <WhenSignedIn>Open portal</WhenSignedIn>
      </PortalAuthProvider>,
    );

    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.queryByText("Open portal")).toBeNull();
  });

  it("shows the portal action only after Clerk reports a session", () => {
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: true,
          isSignedIn: true,
          reason: null,
        }}
      >
        <WhenSignedOut>Sign in</WhenSignedOut>
        <WhenSignedIn>Open portal</WhenSignedIn>
      </PortalAuthProvider>,
    );

    expect(screen.queryByText("Sign in")).toBeNull();
    expect(screen.getByText("Open portal")).toBeTruthy();
  });
});

describe("student session gate", () => {
  it("shows checking your session instead of a blank page while Clerk is loading", () => {
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: false,
          isSignedIn: false,
          reason: null,
        }}
      >
        <SignedIn>Quiz</SignedIn>
        <SignedOut>Login redirect</SignedOut>
      </PortalAuthProvider>,
    );

    expect(screen.getByTestId("status-auth-loading").textContent).toMatch(/Checking your session/i);
    expect(screen.queryByText("Quiz")).toBeNull();
    expect(screen.queryByText("Login redirect")).toBeNull();
  });

  it("shows Reconnecting and Retry when the first Clerk load is slow", () => {
    const retrySession = vi.fn();
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: false,
          isSignedIn: false,
          reason: null,
          reconnecting: true,
          retrySession,
        }}
      >
        <SignedIn>Quiz</SignedIn>
      </PortalAuthProvider>,
    );

    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    fireEvent.click(screen.getByTestId("auth-session-retry"));
    expect(retrySession).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Quiz")).toBeNull();
  });

  it("keeps the quiz mounted and does not redirect when a signed-in session blips", () => {
    const retrySession = vi.fn();
    const { rerender } = render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: true,
          isSignedIn: true,
          reason: null,
        }}
      >
        <SignedIn>
          <div data-testid="quiz">Quiz</div>
        </SignedIn>
        <SignedOut>Login redirect</SignedOut>
      </PortalAuthProvider>,
    );
    const quiz = screen.getByTestId("quiz");

    rerender(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: false,
          isSignedIn: false,
          reason: null,
          holdSignedInShell: true,
          reconnecting: true,
          retrySession,
        }}
      >
        <SignedIn>
          <div data-testid="quiz">Quiz</div>
        </SignedIn>
        <SignedOut>Login redirect</SignedOut>
      </PortalAuthProvider>,
    );

    expect(screen.getByTestId("quiz")).toBe(quiz);
    expect(screen.getByTestId("status-auth-reconnecting").textContent).toMatch(/Reconnecting/i);
    expect(screen.queryByText("Login redirect")).toBeNull();
    fireEvent.click(screen.getByTestId("auth-session-retry"));
    expect(retrySession).toHaveBeenCalledTimes(1);
  });

  it("redirects to login after the grace period when sign-out has a cold token cache", async () => {
    vi.useFakeTimers();
    resetClerkSessionGateForTests();
    clerkSessionTokens.clear();
    clerkAuth.isLoaded = true;
    clerkAuth.isSignedIn = true;
    clerkAuth.userId = "user_a";
    clerkAuth.sessionId = "sess_a";
    clerkAuth.getToken.mockReset();
    clerkAuth.getToken.mockResolvedValue(null);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => (
      <QueryClientProvider client={client}>
        <ClerkPortalAuthBridge>
          <SignedIn>
            <div data-testid="quiz">Quiz</div>
          </SignedIn>
          <SignedOut>Login redirect</SignedOut>
        </ClerkPortalAuthBridge>
      </QueryClientProvider>
    );
    const view = render(tree());
    await act(async () => {});
    expect(screen.getByTestId("quiz")).toBeTruthy();
    expect(screen.queryByText("Login redirect")).toBeNull();

    clerkAuth.isSignedIn = false;
    clerkAuth.userId = null;
    clerkAuth.sessionId = null;
    view.rerender(tree());
    await act(async () => {});
    expect(screen.getByTestId("quiz")).toBeTruthy();
    expect(screen.queryByText("Login redirect")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLERK_SIGNOUT_GRACE_MS - 1_000);
    });
    expect(screen.getByTestId("quiz")).toBeTruthy();
    expect(screen.queryByText("Login redirect")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.queryByTestId("quiz")).toBeNull();
    expect(screen.getByText("Login redirect")).toBeTruthy();
  });
});
