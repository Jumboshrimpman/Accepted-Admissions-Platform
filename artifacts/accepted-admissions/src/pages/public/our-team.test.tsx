import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  publicApiPath: (path: string) => path,
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import OurTeam from "./our-team";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OurTeam publication gate", () => {
  it("does not expose tutor profiles when team page content is unpublished", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/public/tutors")) {
        return new Response(JSON.stringify([{
          id: "tutor-1",
          name: "Approved Tutor",
          title: "SAT Tutor",
          photoUrl: null,
          photoAltText: null,
          biography: "Approved biography",
          subjects: ["SAT"],
          linkedinUrl: null,
        }]), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Published content not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }));

    render(<OurTeam />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Approved Tutor")).toBeNull();
  });
});