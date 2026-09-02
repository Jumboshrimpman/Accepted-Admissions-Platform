import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  publicApiPath: (path: string) => path,
  fetchPublicJson: async (path: string) => {
    const response = await fetch(path);
    return response.json();
  },
}));

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import OurTeam from "./our-team";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OurTeam publication gate", () => {
  it("renders the approved team roster with each public profile's purpose", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/api/public/tutors")) {
          return new Response(
            JSON.stringify([
              {
                id: "rosanna",
                name: "Rosanna Kataja",
                title: "Admissions Tutor",
                photoUrl: "https://example.com/rosanna.jpg",
                photoAltText: "Rosanna Kataja, Admissions Tutor",
                biography: "Approved admissions biography",
                subjects: ["College admissions"],
                linkedinUrl: null,
              },
              {
                id: "xavier",
                name: "Xavier Morales",
                title: "SAT & Math Tutor",
                photoUrl: "https://example.com/xavier.jpg",
                photoAltText: "Xavier Morales, SAT and Math Tutor",
                biography: "Approved SAT biography",
                subjects: ["SAT", "Math"],
                linkedinUrl:
                  "https://www.linkedin.com/in/xavier-morales-8830821a5/",
              },
              {
                id: "nika",
                name: "Nika Raiffe",
                title: "Admissions Tutor",
                photoUrl: "https://example.com/nika.png",
                photoAltText: "Nika Raiffe, Admissions Tutor",
                biography: "Approved admissions biography",
                subjects: ["College admissions"],
                linkedinUrl: "https://www.linkedin.com/in/nika-raiffe",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            title: "Meet Our Team",
            seoTitle: "Meet Our Team | Accepted Admissions",
            seoDescription: "Approved team content.",
            body: { intro: "Choose the expert best fit for you." },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    render(<OurTeam />);

    expect(await screen.findByText("Rosanna Kataja")).toBeTruthy();
    expect(screen.getByText("Xavier Morales")).toBeTruthy();
    expect(
      screen.getByText("Choose the expert best fit for you."),
    ).toBeTruthy();
    const roster = screen.getByRole("region", {
      name: "Approved team profiles",
    });
    expect(roster.className).toContain("grid-cols-1");
    expect(roster.className).toContain("sm:grid-cols-2");
    expect(roster.className).toContain("xl:grid-cols-4");
    expect(
      within(roster)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Rosanna Kataja", "Xavier Morales", "Nika Raiffe"]);
    expect(
      screen.getByAltText("Rosanna Kataja, Admissions Tutor"),
    ).toBeTruthy();
    expect(screen.getByAltText("Nika Raiffe, Admissions Tutor")).toBeTruthy();
    expect(screen.getByAltText("Nika Raiffe, Admissions Tutor").getAttribute("src")).toBe("https://example.com/nika.png");
    expect(
      screen
        .getByRole("link", { name: "View Xavier Morales on LinkedIn" })
        .getAttribute("href"),
    ).toBe("https://www.linkedin.com/in/xavier-morales-8830821a5/");
  });

  it("does not expose tutor profiles when team page content is unpublished", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/api/public/tutors")) {
          return new Response(
            JSON.stringify([
              {
                id: "tutor-1",
                name: "Approved Tutor",
                title: "SAT Tutor",
                photoUrl: null,
                photoAltText: null,
                biography: "Approved biography",
                subjects: ["SAT"],
                linkedinUrl: null,
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ error: "Published content not found" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    render(<OurTeam />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Approved Tutor")).toBeNull();
  });
});
