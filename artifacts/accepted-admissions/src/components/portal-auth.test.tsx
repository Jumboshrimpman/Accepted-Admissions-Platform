import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  PortalAuthProvider,
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
