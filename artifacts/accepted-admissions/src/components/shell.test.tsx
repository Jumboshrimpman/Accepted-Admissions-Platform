import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/error-boundary";

const currentUser = vi.hoisted(() => ({
  data: undefined as
    | {
        role: "student" | "tutor" | "administrator";
        displayName: string;
        avatarUrl: string | null;
      }
    | undefined,
  isLoading: true,
  error: null as unknown,
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
});
