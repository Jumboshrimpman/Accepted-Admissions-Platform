import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@clerk/react", () => ({
  Show: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import NotFound from "./not-found";

afterEach(cleanup);

describe("Public 404", () => {
  it("points visitors to the in-app marketing counterparts instead of a developer message", () => {
    render(<NotFound />);

    expect(screen.getByTestId("status-not-found").textContent).toMatch(
      /not available/i,
    );
    expect(screen.queryByText(/forget to add the page/i)).toBeNull();
    expect(screen.getByTestId("link-not-found-home").getAttribute("href")).toBe(
      "/",
    );
    expect(screen.getByTestId("link-not-found-sat").getAttribute("href")).toBe(
      "/sat",
    );
    expect(
      screen.getByTestId("link-not-found-guidance").getAttribute("href"),
    ).toBe("/client-request");
  });
});
