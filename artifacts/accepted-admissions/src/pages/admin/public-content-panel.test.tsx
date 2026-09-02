import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: mocks.customFetch,
}));

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { PublicContentPanel } from "./public-content-panel";

const tutors = [
  {
    id: "approved-active",
    email: "active@example.invalid",
    name: "Current Tutor",
    title: "SAT Tutor",
    photoUrl: null,
    photoAltText: null,
    biography: "Current approved biography.",
    subjects: ["SAT"],
    linkedinUrl: null,
    publicApproved: true,
    active: true,
    bookingEligible: true,
  },
  {
    id: "approved-inactive",
    email: "inactive@example.invalid",
    name: "Inactive Tutor",
    title: "Former Tutor",
    photoUrl: null,
    photoAltText: null,
    biography: "This profile is inactive.",
    subjects: ["SAT"],
    linkedinUrl: null,
    publicApproved: true,
    active: false,
    bookingEligible: false,
  },
  {
    id: "unapproved-active",
    email: "draft@example.invalid",
    name: "Draft Tutor",
    title: "Draft Tutor",
    photoUrl: null,
    photoAltText: null,
    biography: "This profile is not approved.",
    subjects: ["SAT"],
    linkedinUrl: null,
    publicApproved: false,
    active: true,
    bookingEligible: false,
  },
];

const content = [
  {
    id: "team-content",
    slug: "our-team",
    title: "Saved team title",
    seoTitle: "Saved team SEO title",
    seoDescription: "Saved team description",
    status: "draft" as const,
    body: { intro: "Saved team introduction." },
  },
  {
    id: "success-content",
    slug: "past-success",
    title: "Saved stories title",
    seoTitle: "Saved stories SEO title",
    seoDescription: "Saved stories description",
    status: "draft" as const,
    body: {},
  },
];

afterEach(() => {
  cleanup();
  mocks.customFetch.mockReset();
});

function mockInitialRequests() {
  mocks.customFetch.mockImplementation(async (path: string) => {
    if (path === "/api/admin/tutors") return tutors;
    if (path === "/api/admin/public-content") return content;
    throw new Error(`Unexpected request: ${path}`);
  });
}

describe("administrator public content previews", () => {
  test("renders current unsaved values in both previews without saving or publishing", async () => {
    mockInitialRequests();
    render(<PublicContentPanel />);

    expect(
      await screen.findByRole("heading", {
        name: "Public team and student-story content",
      }),
    ).toBeTruthy();

    expect(screen.getByText("Current Tutor")).toBeTruthy();
    expect(screen.queryByText("Inactive Tutor")).toBeTruthy();
    expect(screen.queryByText("Draft Tutor")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("Saved team title"), {
      target: { value: "Unsaved team title" },
    });
    fireEvent.change(screen.getByDisplayValue("Saved team introduction."), {
      target: { value: "Unsaved team introduction." },
    });
    fireEvent.click(screen.getByTestId("button-preview-our-team"));

    const teamDialog = await screen.findByRole("dialog");
    expect(within(teamDialog).getByRole("heading", { name: "Our Team preview" })).toBeTruthy();
    expect(within(teamDialog).getByRole("heading", { name: "Unsaved team title" })).toBeTruthy();
    expect(within(teamDialog).getByText("Unsaved team introduction.")).toBeTruthy();
    expect(within(teamDialog).getByText("Current Tutor")).toBeTruthy();
    expect(within(teamDialog).queryByText("Inactive Tutor")).toBeNull();
    expect(within(teamDialog).queryByText("Draft Tutor")).toBeNull();
    expect(within(teamDialog).getByText(/current editor values/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.change(screen.getByDisplayValue("Saved stories title"), {
      target: { value: "Unsaved stories title" },
    });
    fireEvent.click(screen.getByTestId("button-preview-student-stories"));
    const storiesDialog = await screen.findByRole("dialog");
    expect(within(storiesDialog).getByRole("heading", { name: "Student Stories preview" })).toBeTruthy();
    expect(within(storiesDialog).getByRole("heading", { name: "Unsaved stories title" })).toBeTruthy();
    expect(within(storiesDialog).getByTestId("status-stories-no-testimonial")).toBeTruthy();
    expect(
      within(storiesDialog).getByText("Approved destination details will appear here when available."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(mocks.customFetch).toHaveBeenCalledTimes(2);
    expect(
      mocks.customFetch.mock.calls.filter(([, options]) => options?.method === "PATCH"),
    ).toHaveLength(0);
  });
});