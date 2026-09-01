import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  publicApiPath: (path: string) => path,
}));

import PastSuccess from "./past-success";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Student Stories publication states", () => {
  it("renders only the approved story and destination details returned by the API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      title: "Student Stories",
      seoTitle: "Student Stories | Accepted Admissions",
      seoDescription: "Approved public content.",
      body: {
        intro: "Approved introduction.",
        testimonial: { quote: "Approved perspective.", attribution: "Student A", attributionMode: "named" },
        schoolLogos: [{ name: "Example University", src: "https://example.com/logo.png", alt: "Example University logo" }],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<PastSuccess />);

    expect((await screen.findByTestId("story-testimonial")).textContent).toContain("Approved perspective.");
    expect(screen.getByAltText("Example University logo")).toBeTruthy();
    expect(screen.getByText(/not guarantees/i)).toBeTruthy();
  });

  it("shows an error instead of fallback marketing when content is unpublished", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Published content not found" }), { status: 404 })));

    render(<PastSuccess />);

    expect(await screen.findByTestId("status-stories-error")).toBeTruthy();
    expect(screen.queryByText("Approved perspective.")).toBeNull();
  });
});