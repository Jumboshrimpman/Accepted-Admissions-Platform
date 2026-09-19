import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CanonicalAppHostGate } from "./canonical-app-host-gate";

afterEach(() => {
  cleanup();
});

describe("CanonicalAppHostGate", () => {
  it("replaces www login with the same path on the app host", () => {
    const replace = vi.fn();
    render(
      <CanonicalAppHostGate
        location={{
          hostname: "www.acceptedadmissions.org",
          pathname: "/login",
          search: "?returnTo=/portal",
        }}
        replace={replace}
      >
        <div data-testid="gate-children">children</div>
      </CanonicalAppHostGate>,
    );

    expect(replace).toHaveBeenCalledWith(
      "https://app.acceptedadmissions.org/login?returnTo=/portal",
    );
    expect(screen.getByTestId("status-login-loading").textContent).toMatch(
      /continuing on the app host/i,
    );
    expect(screen.queryByTestId("gate-children")).toBeNull();
  });

  it("does not redirect the working app host or marketing pages", () => {
    const replace = vi.fn();
    render(
      <CanonicalAppHostGate
        location={{
          hostname: "app.acceptedadmissions.org",
          pathname: "/login",
        }}
        replace={replace}
      >
        <div data-testid="gate-children">login on app</div>
      </CanonicalAppHostGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("gate-children").textContent).toBe("login on app");
    cleanup();

    render(
      <CanonicalAppHostGate
        location={{
          hostname: "www.acceptedadmissions.org",
          pathname: "/",
        }}
        replace={replace}
      >
        <div data-testid="gate-children">marketing</div>
      </CanonicalAppHostGate>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("gate-children").textContent).toBe("marketing");
  });
});
