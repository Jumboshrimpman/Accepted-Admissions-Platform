import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@clerk/react", () => ({
  Show: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

import { PublicSiteShell, resolvePublicPath } from "./public-site-shell";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('link[rel="canonical"]').forEach((element) => element.remove());
});

describe("PublicSiteShell", () => {
  it("opens an accessible mobile navigation menu", () => {
    render(<PublicSiteShell><main>Page content</main></PublicSiteShell>);

    const toggle = screen.getByRole("button", { name: "Open navigation menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close navigation menu" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("sets route metadata and canonical URLs", () => {
    render(
      <PublicSiteShell title="Our team | Accepted Admissions" description="Approved team profiles.">
        <main>Team</main>
      </PublicSiteShell>,
    );

    expect(document.title).toBe("Our team | Accepted Admissions");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Approved team profiles.");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("http://localhost:3000");
  });

  it("keeps assets and API calls inside a configured base path", () => {
    expect(resolvePublicPath("/logo.svg", "/accepted-admissions/")).toBe("/accepted-admissions/logo.svg");
    expect(resolvePublicPath("api/public/products", "/accepted-admissions")).toBe("/accepted-admissions/api/public/products");
  });
});