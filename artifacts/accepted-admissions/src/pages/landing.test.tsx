import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import Landing from "./landing";

afterEach(cleanup);

describe("Landing visitor paths", () => {
  it("separates the purchasable SAT offer from inquiry-only guidance", () => {
    render(<Landing />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("A clear next step");
    expect(screen.getByTestId("link-home-sat").getAttribute("href")).toBe("/sat");
    expect(screen.getByTestId("link-home-guidance").getAttribute("href")).toBe("/client-request");
    expect(screen.getByText(/purchase one hour or a ten-hour package at \$130 per credit/i)).toBeTruthy();
    expect(screen.getByText(/harvard students and recent graduates/i)).toBeTruthy();
    expect(screen.getAllByText(/meet the team to learn about our tutors/i)).not.toHaveLength(0);
    expect(screen.getByText(/our SAT tutors/i)).toBeTruthy();
    expect(screen.queryByText(/Xavier or Eunice/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /xavier/i })).toBeNull();
    expect(screen.getByText(/starts with a private inquiry—not checkout/i)).toBeTruthy();

    const main = within(screen.getByRole("main"));
    expect(main.queryByText(/Fall 2026/i)).toBeNull();
    expect(main.queryByText(/\$175/)).toBeNull();
    expect(main.queryByText(/\$800/)).toBeNull();
    expect(main.queryByText(/\$1,500/)).toBeNull();
    expect(main.queryByText(/\$2,400/)).toBeNull();
    expect(main.queryByText(/5-hour/i)).toBeNull();
    expect(main.queryByText(/20-hour/i)).toBeNull();
  });

  it("keeps a visible portal sign-in path for students, tutors, and administrators", () => {
    render(<Landing />);

    const signIn = screen.getByTestId("link-home-sign-in");
    expect(signIn.getAttribute("href")).toBe("/login");
    expect(signIn.textContent).toMatch(/sign in to your portal/i);
    expect(screen.getByText(/students, tutors, and administrators/i)).toBeTruthy();
  });
});