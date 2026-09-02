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

import { PublicSiteShell, fetchPublicJson, resolvePublicPath } from "./public-site-shell";

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
    expect(screen.getAllByRole("link", { name: "SAT tutoring" })[1]).toBe(document.activeElement);
  });

  it("uses one clear navigation vocabulary for each visitor path", () => {
    render(<PublicSiteShell><main>Page content</main></PublicSiteShell>);

    const mainNavigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(mainNavigation.textContent).toContain("SAT tutoring");
    expect(mainNavigation.textContent).toContain("Meet the team");
    expect(mainNavigation.textContent).toContain("Student stories");
    expect(mainNavigation.textContent).toContain("Get guidance");
    expect(screen.getByTestId("link-header-guidance").getAttribute("href")).toBe("/client-request");
  });

  it("sets route metadata and canonical URLs", () => {
    render(
      <PublicSiteShell title="Our team | Accepted Admissions" description="Approved team profiles.">
        <main>Team</main>
      </PublicSiteShell>,
    );

    expect(document.title).toBe("Our team | Accepted Admissions");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Approved team profiles.");
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe("website");
    expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe("summary_large_image");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("http://localhost:3000");
  });

  it("keeps assets and API calls inside a configured base path", () => {
    expect(resolvePublicPath("/logo.svg", "/accepted-admissions/")).toBe("/accepted-admissions/logo.svg");
    expect(resolvePublicPath("api/public/products", "/accepted-admissions")).toBe("/accepted-admissions/api/public/products");
  });

  it("rejects HTML fallbacks and malformed public JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!doctype html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })));
    await expect(fetchPublicJson("/api/public/content/past-success")).rejects.toThrow("non-JSON");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not-json", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(fetchPublicJson("/api/public/content/past-success")).rejects.toThrow("malformed JSON");
  });

  it("uses the coordinated A mark in the shared public shell", () => {
    render(<PublicSiteShell><main>Page content</main></PublicSiteShell>);

    const logo = screen.getByRole("img", { name: "Accepted Admissions" });
    expect(logo.getAttribute("src")).toContain("/logo.svg");
    expect(logo.className).toContain("dark:invert");
  });
});