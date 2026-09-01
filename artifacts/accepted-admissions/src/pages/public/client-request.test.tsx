import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/components/public-site-shell", () => ({
  PublicSiteShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  publicApiPath: (path: string) => path,
}));

import ClientRequest from "./client-request";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Guidance request form", () => {
  it("explains the inquiry path and preserves answers after a recoverable error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Review your contact details." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })));

    render(<ClientRequest />);

    expect(screen.getByText(/needs go beyond the listed SAT offer/i)).toBeTruthy();
    expect(screen.getByTestId("link-request-sat").getAttribute("href")).toBe("/sat");

    const name = screen.getByTestId("input-request-guardianName") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Jordan Parent" } });
    fireEvent.submit(screen.getByRole("button", { name: /submit guidance request/i }).closest("form")!);

    expect(await screen.findByTestId("status-request-error")).toBeTruthy();
    expect(name.value).toBe("Jordan Parent");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("status-request-error")));
  });
});