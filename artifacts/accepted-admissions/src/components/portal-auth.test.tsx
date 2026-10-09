import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  PortalAuthProvider,
  SignedIn,
  SignedOut,
  WhenSignedIn,
  WhenSignedOut,
} from "./portal-auth";

afterEach(cleanup);

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
});
