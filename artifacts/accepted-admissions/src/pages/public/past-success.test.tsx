import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  publicApiPath: (path: string) => path,
  fetchPublicJson: async (path: string) => {
    const response = await fetch(path);
    return response.json();
  },
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

  it("keeps the approved story visible when an individual school logo fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      title: "Student Stories",
      seoTitle: "Student Stories | Accepted Admissions",
      seoDescription: "Approved public content.",
      body: {
        testimonial: { quote: "Approved perspective.", attributionMode: "anonymous" },
        schoolLogos: [
          { name: "Unavailable University", src: "https://example.com/missing.png", alt: "Unavailable University logo" },
          { name: "Other University", src: "https://example.com/other.png", alt: "Other University logo" },
        ],
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<PastSuccess />);

    expect(await screen.findByTestId("story-testimonial")).toBeTruthy();
    fireEvent.error(screen.getByAltText("Unavailable University logo"));
    expect(screen.getByText("Unavailable University")).toBeTruthy();
    expect(screen.getByAltText("Other University logo")).toBeTruthy();
    expect(screen.queryByTestId("status-stories-error")).toBeNull();
  });

  it("renders safe empty states when optional story fields are absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      title: "Student Stories",
      seoTitle: "Student Stories | Accepted Admissions",
      seoDescription: "Approved public content.",
      body: {},
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<PastSuccess />);

    expect(await screen.findByTestId("status-stories-no-testimonial")).toBeTruthy();
    expect(screen.getByText("Approved destination details will appear here when available.")).toBeTruthy();
  });
});