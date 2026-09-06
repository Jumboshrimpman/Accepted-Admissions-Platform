import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  publicApiPath: (path: string) => path,
  resolvePublicMediaUrl: (url: string | null | undefined) => url ?? undefined,
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
    expect(roster.className).toContain("lg:grid-cols-3");
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

  it("keeps the complete approved roster and portrait mapping in sequence", async () => {
    const approvedRoster = [
      ["Rosanna Kataja", "rosanna"],
      ["Xavier Morales", "xavier"],
      ["Eunice Chon", "eunice"],
      ["Sophia Lamas", "sophia"],
      ["Aurelia Finch", "aurelia"],
      ["Nika Raiffe", "nika"],
      ["Kya Brooks", "kya"],
      ["Michael Pecorara", "michael"],
      ["Kyle Englander", "kyle"],
      ["Daniel Salgado-Alvarez", "daniel"],
      ["Sama Noori", "sama"],
    ] as const;
    const approvedPortraits: Record<string, string> = {
      xavier: "/media/team/xavier-morales.jpg",
      eunice: "/media/team/eunice-chon.jpg",
      nika: "/media/team/nika-raiffe.png",
      kya: "/media/team/kya-brooks.jpg",
      michael: "/media/team/michael-pecorara.jpg",
      kyle: "/media/team/kyle-englander.jpg",
      daniel: "/media/team/daniel-salgado-alvarez.png",
      sama: "/media/team/sama-noori.jpg",
    };
    const approvedBiographies: Record<string, string> = {
      xavier:
        "Xavier is a 2024 graduate of Harvard where he studied Applied Math, Economics, and Philosophy. He currently works in finance at Jane Street Capital on Strategy and Product. He was a 2024 Rhodes Scholar and 2026 Oxford graduate, studying Philosophy for his Masters. Xavier is also an incoming member of the 2030 Harvard Law School class.",
      eunice:
        "Eunice is a Harvard 2024 graduate in History of Science and Philosophy at Harvard College, where she earned high honors. She is currently a doctoral student in History and a clinical researcher at Harvard Medical School/Massachusetts General Hospital.",
      nika:
        "Nika Raiffe is a senior studying political science, law, and psychology in a dual degree between Columbia University and Sciences Po Paris. She is currently a summer business analyst in the Goldman Sachs Business Intelligence Group. She previously worked at Columbia's Irving Medical Center as a Research Intern on Relational Health.",
      kya: "Kya is a senior at Harvard studying economics and the History of Art and Literature.",
    };
    const tutors = [...approvedRoster].reverse().map(([name, id]) => ({
      id,
      name,
      title: name === "Kya Brooks" ? "Admissions Tutor" : "Tutor",
      photoUrl: approvedPortraits[id] ?? `https://example.com/${id}.jpg`,
      photoAltText: `${name}, ${name === "Kya Brooks" ? "Admissions Tutor" : "Tutor"}`,
      biography: approvedBiographies[id] ?? `Approved biography for ${name}.`,
      subjects: [],
      linkedinUrl: name === "Michael Pecorara"
        ? "https://www.linkedin.com/in/michaelpecorara/"
        : null,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        return new Response(
          JSON.stringify(
            url.endsWith("/api/public/tutors")
              ? tutors
              : {
                  title: "Meet Our Team",
                  seoTitle: "Meet Our Team | Accepted Admissions",
                  seoDescription: "Approved team content.",
                  body: { intro: "Choose the expert best fit for you." },
                },
          ),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    render(<OurTeam />);

    const roster = await screen.findByRole("region", {
      name: "Approved team profiles",
    });
    expect(
      within(roster)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(approvedRoster.map(([name]) => name));

    const xavierCard = screen.getByTestId("card-team-xavier");
    const euniceCard = screen.getByTestId("card-team-eunice");
    const nikaCard = screen.getByTestId("card-team-nika");
    const kyaCard = screen.getByTestId("card-team-kya");
    const michaelCard = screen.getByTestId("card-team-michael");
    const xavierImage = within(xavierCard).getByAltText("Xavier Morales, Tutor");
    const euniceImage = within(euniceCard).getByAltText("Eunice Chon, Tutor");
    const nikaImage = within(nikaCard).getByAltText("Nika Raiffe, Tutor");
    const kyaImage = within(kyaCard).getByAltText("Kya Brooks, Admissions Tutor");
    const michaelImage = within(michaelCard).getByAltText("Michael Pecorara, Tutor");
    expect(xavierImage.getAttribute("src")).toContain("/media/team/xavier-morales.jpg");
    expect(euniceImage.getAttribute("src")).toContain("/media/team/eunice-chon.jpg");
    expect(nikaImage.getAttribute("src")).toContain("/media/team/nika-raiffe.png");
    expect(kyaImage.getAttribute("src")).toContain("/media/team/kya-brooks.jpg");
    expect(michaelImage.getAttribute("src")).toContain("/media/team/michael-pecorara.jpg");
    expect(within(xavierCard).getByText(/Jane Street Capital/)).toBeTruthy();
    expect(within(xavierCard).queryByText(/2029 Harvard Law School/)).toBeNull();
    expect(within(euniceCard).getByText(/Harvard Medical School\/Massachusetts General Hospital/)).toBeTruthy();
    expect(within(euniceCard).queryByText(/third-year at Harvard College/)).toBeNull();
    expect(within(nikaCard).getByText(/Goldman Sachs Business Intelligence Group/)).toBeTruthy();
    expect(within(nikaCard).getByText(/as a Research Intern on Relational Health/)).toBeTruthy();
    expect(within(nikaCard).queryByText(/sophomore studying/)).toBeNull();
    expect(within(nikaCard).queryByText(/at a Research Intern/)).toBeNull();
    expect(within(kyaCard).getByText(/Kya is a senior at Harvard/)).toBeTruthy();
    expect(
      within(michaelCard)
        .getByRole("link", { name: "View Michael Pecorara on LinkedIn" })
        .getAttribute("href"),
    ).toBe("https://www.linkedin.com/in/michaelpecorara/");

    fireEvent.error(kyaImage);

    expect(within(kyaCard).getByTestId("team-placeholder-kya")).toBeTruthy();
    expect(
      within(kyaCard).getByRole("img", {
        name: "Kya Brooks, Admissions Tutor — portrait unavailable",
      }),
    ).toBeTruthy();
    expect(within(michaelCard).getByAltText("Michael Pecorara, Tutor")).toBeTruthy();
    expect(within(michaelCard).queryByTestId("team-placeholder-michael")).toBeNull();
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
