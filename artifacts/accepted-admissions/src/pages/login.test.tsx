import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const productionLiveKey = `pk_live_${Buffer.from("clerk.acceptedadmissions.org$", "utf8")
  .toString("base64")
  .replace(/=+$/, "")}`;

beforeEach(() => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", productionLiveKey);
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/login");
  Reflect.deleteProperty(window, "Clerk");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubClerkScriptReachable() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
}

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
    stubClerkScriptReachable();
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
    stubClerkScriptReachable();
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
      /could not load clerk/i,
    );
    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /script did not load/i,
    );
    expect(screen.getByTestId("text-login-failed-host").textContent).toBe(
      "clerk.acceptedadmissions.org",
    );
    expect(screen.getByTestId("text-login-failed-script").textContent).toContain(
      "clerk.acceptedadmissions.org/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    );
    expect(screen.getByTestId("link-login-error-home").getAttribute("href")).toBe(
      "/",
    );
    vi.useRealTimers();
  });

  it("does not blame a missing script when Clerk already exists after the timeout", () => {
    stubClerkScriptReachable();
    vi.stubGlobal("Clerk", { loaded: false });
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

    act(() => {
      vi.advanceTimersByTime(CLERK_LOAD_TIMEOUT_MS);
    });
    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /could not start clerk/i,
    );
    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /script loaded/i,
    );
    expect(screen.getByTestId("status-login-error").textContent).not.toMatch(
      /script did not load/i,
    );
    vi.useRealTimers();
  });

  it("surfaces a Clerk.load subdomain rejection instead of a missing-script diagnosis", () => {
    stubClerkScriptReachable();
    vi.stubGlobal("Clerk", { loaded: false });
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

    const reason = new Error(
      "The request origin subdomain is not in the allowed subdomains list for this instance.",
    );
    const promise = Promise.reject(reason);
    promise.catch(() => undefined);
    act(() => {
      window.dispatchEvent(
        new PromiseRejectionEvent("unhandledrejection", { reason, promise }),
      );
    });

    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /cannot start on this host/i,
    );
    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /allowed subdomains/i,
    );
    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /app\.acceptedadmissions\.org\/login/i,
    );
    expect(screen.getByTestId("status-login-error").textContent).not.toMatch(
      /script did not load/i,
    );
  });

  it("shows the failed Clerk host when the browser script cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
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

    expect(await screen.findByTestId("text-login-failed-host")).toBeTruthy();
    expect(screen.getByTestId("text-login-failed-host").textContent).toBe(
      "clerk.acceptedadmissions.org",
    );
    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /clerk\.acceptedadmissions\.org/i,
    );
    expect(screen.getByTestId("status-login-error").textContent).not.toMatch(
      /clerk\.app\.acceptedadmissions\.org/i,
    );
    expect(screen.getByTestId("status-login-error").textContent).toMatch(
      /script did not load/i,
    );
  });

  it("does not treat a no-cors probe failure as a missing script when Clerk already ran", async () => {
    vi.stubGlobal("Clerk", { loaded: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
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

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("status-login-loading")).toBeTruthy();
    expect(screen.queryByTestId("status-login-error")).toBeNull();
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
    expect(
      loginReturnPath("?returnTo=/portal/sat", "https://app.acceptedadmissions.org"),
    ).toBe("/portal/sat");
    expect(loginReturnPath("", "https://app.acceptedadmissions.org")).toBe(
      "/portal",
    );
  });

  it("renders standalone loading and error chrome for the login shell", () => {
    render(<LoginLoadingState />);
    expect(screen.getByTestId("status-login-loading")).toBeTruthy();
    cleanup();
    render(
      <LoginErrorState
        title="Sign-in could not start"
        body="Try home."
        failedHost="clerk.acceptedadmissions.org"
        scriptUrl="https://clerk.acceptedadmissions.org/npm/@clerk/clerk-js@6/dist/clerk.browser.js"
      />,
    );
    expect(screen.getByTestId("status-login-error").textContent).toContain(
      "Sign-in could not start",
    );
    expect(screen.getByTestId("text-login-failed-host").textContent).toBe(
      "clerk.acceptedadmissions.org",
    );
  });
});
