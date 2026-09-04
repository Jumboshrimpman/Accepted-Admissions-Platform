import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
vi.mock("@clerk/react", () => ({
  SignIn: () => <div data-testid="clerk-sign-in">Clerk sign-in form</div>,
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock("wouter", () => ({
  Redirect: ({ to }: { to: string }) => <div data-testid="login-redirect">{to}</div>,
}));

import { PortalAuthProvider } from "@/components/portal-auth";
import {
  CLERK_LOAD_TIMEOUT_MS,
  LoginErrorState,
  LoginLoadingState,
  SignInPage,
  loginReturnPath,
} from "./login";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/login");
});

describe("login page", () => {
  it("keeps heading, helper copy, and a home recovery link on the sign-in screen", () => {
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: true,
          isSignedIn: false,
          reason: null,
        }}
      >
        <SignInPage />
      </PortalAuthProvider>,
    );

    expect(screen.getByTestId("heading-login").textContent).toMatch(
      /sign in to your portal/i,
    );
    expect(screen.getByTestId("text-login-helper").textContent).toMatch(
      /students, tutors, and administrators/i,
    );
    expect(screen.getByTestId("link-login-home").getAttribute("href")).toBe("/");
    expect(screen.getByTestId("clerk-sign-in")).toBeTruthy();
  });

  it("shows a loading state instead of a blank SignIn while Clerk is not ready", () => {
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: false,
          isSignedIn: false,
          reason: null,
        }}
      >
        <SignInPage />
      </PortalAuthProvider>,
    );

    expect(screen.getByTestId("status-login-loading").textContent).toMatch(
      /loading secure sign-in/i,
    );
    expect(screen.queryByTestId("clerk-sign-in")).toBeNull();
    expect(screen.getByTestId("heading-login")).toBeTruthy();
  });

  it("shows a readable error with a home link when the publishable key is missing", () => {
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: false,
          isLoaded: true,
          isSignedIn: false,
          reason: "missing",
        }}
      >
        <SignInPage />
      </PortalAuthProvider>,
    );

    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /missing its Clerk publishable key/i,
    );
    expect(screen.getByTestId("link-login-error-home").getAttribute("href")).toBe(
      "/",
    );
    expect(screen.queryByTestId("clerk-sign-in")).toBeNull();
  });

  it("shows a readable error if Clerk never becomes ready", () => {
    vi.useFakeTimers();
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: false,
          isSignedIn: false,
          reason: null,
        }}
      >
        <SignInPage />
      </PortalAuthProvider>,
    );

    expect(screen.getByTestId("status-login-loading")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(CLERK_LOAD_TIMEOUT_MS);
    });
    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /taking too long/i,
    );
    expect(screen.getByTestId("link-login-error-home").getAttribute("href")).toBe(
      "/",
    );
    vi.useRealTimers();
  });

  it("continues to the safe return path after an existing session is ready", () => {
    window.history.pushState({}, "", "/login?returnTo=/tutor");
    render(
      <PortalAuthProvider
        value={{
          clerkAvailable: true,
          isLoaded: true,
          isSignedIn: true,
          reason: null,
        }}
      >
        <SignInPage />
      </PortalAuthProvider>,
    );

    expect(screen.getByTestId("login-redirect").textContent).toBe("/tutor");
  });
});

describe("login helpers", () => {
  it("keeps a same-origin returnTo and falls back to the portal", () => {
    expect(
      loginReturnPath("?returnTo=/sat", "https://app.acceptedadmissions.org"),
    ).toBe("/sat");
    expect(loginReturnPath("", "https://app.acceptedadmissions.org")).toBe(
      "/portal",
    );
  });

  it("renders standalone loading and error chrome for the login shell", () => {
    render(<LoginLoadingState />);
    expect(screen.getByTestId("status-login-loading")).toBeTruthy();
    cleanup();
    render(
      <LoginErrorState title="Sign-in could not start" body="Try home." />,
    );
    expect(screen.getByTestId("status-login-error").textContent).toContain(
      "Sign-in could not start",
    );
  });
});
