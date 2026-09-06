import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/error-boundary";

const currentUser = vi.hoisted(() => ({
  data: undefined as
    | {
        role: "student" | "tutor" | "administrator";
        displayName: string;
        title?: string | null;
        avatarUrl: string | null;
      }
    | undefined,
  isLoading: true,
  error: null as unknown,
  refetch: vi.fn(),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { fullName: "Test User", firstName: "Test", imageUrl: "" } }),
  useClerk: () => ({ signOut: vi.fn() }),
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
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetCurrentUserQueryKey: () => ["/api/me"],
  useGetCurrentUser: () => currentUser,
}));

import { Shell } from "./shell";

afterEach(() => {
  cleanup();
  currentUser.data = undefined;
  currentUser.isLoading = true;
  currentUser.error = null;
});

function renderShell() {
  return render(
    <ErrorBoundary>
      <Shell>Portal content</Shell>
    </ErrorBoundary>,
  );
}

describe("Shell", () => {
  it("keeps hook order stable while portal access loads after OTP", () => {
    currentUser.isLoading = true;
    currentUser.data = undefined;

    const { rerender } = renderShell();
    expect(screen.getByText("Checking portal access…")).toBeTruthy();

    currentUser.isLoading = false;
    currentUser.data = {
      role: "student",
      displayName: "Test User",
      avatarUrl: null,
    };

    rerender(
      <ErrorBoundary>
        <Shell>Portal content</Shell>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Portal content")).toBeTruthy();
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Portal navigation" })).toBeTruthy();
  });

  it("hides Finance from admin nav and offers Book SAT from the client portal", () => {
    currentUser.isLoading = false;
    currentUser.data = {
      role: "administrator",
      displayName: "Sama",
      avatarUrl: null,
    };
    const { rerender } = renderShell();
    expect(screen.queryByRole("link", { name: /Finance/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Curriculum" })).toBeTruthy();

    currentUser.data = {
      role: "student",
      displayName: "Michelle",
      avatarUrl: null,
    };
    rerender(
      <ErrorBoundary>
        <Shell>Portal content</Shell>
      </ErrorBoundary>,
    );
    expect(screen.getByRole("link", { name: "Book SAT" }).getAttribute("href")).toBe("/portal/sat");
  });

  it("shows the signed-in display name instead of Accepted Admissions User", () => {
    currentUser.isLoading = false;
    currentUser.data = {
      role: "student",
      displayName: "Accepted Admissions user",
      title: null,
      avatarUrl: null,
    };

    renderShell();

    expect(screen.getByTestId("portal-profile-display-name").textContent).toBe("Test User");
    expect(screen.queryByText("Accepted Admissions User")).toBeNull();
    expect(screen.queryByText("Accepted Admissions user")).toBeNull();
  });

  it("shows a persisted title in the header chrome", () => {
    currentUser.isLoading = false;
    currentUser.data = {
      role: "administrator",
      displayName: "Sama Noori",
      title: "Founder",
      avatarUrl: "https://example.com/sama.jpg",
    };

    renderShell();

    expect(screen.getByTestId("portal-profile-display-name").textContent).toBe("Sama Noori");
    expect(screen.getByTestId("portal-profile-title-label").textContent).toBe("Founder");
    expect(screen.getByTestId("portal-profile-menu").querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/sama.jpg",
    );
  });
});
