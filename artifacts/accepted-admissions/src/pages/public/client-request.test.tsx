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
    expect(screen.queryByTestId("link-request-sat")).toBeNull();
    expect(screen.queryByText(/Looking for SAT tutoring\? Start here/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /looking for SAT tutoring/i })).toBeNull();

    const name = screen.getByTestId("input-request-guardianName") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Jordan Parent" } });
    fireEvent.submit(screen.getByRole("button", { name: /submit guidance request/i }).closest("form")!);

    expect(await screen.findByTestId("status-request-error")).toBeTruthy();
    expect(name.value).toBe("Jordan Parent");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("status-request-error")));
  });

  it("treats a saved request as success and does not claim email was delivered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: "request-1",
      status: "received",
      message: "Thanks — we received your request.",
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    })));

    render(<ClientRequest />);
    fireEvent.submit(screen.getByRole("button", { name: /submit guidance request/i }).closest("form")!);

    const success = await screen.findByTestId("status-request-success");
    expect(success.textContent).toMatch(/request received/i);
    expect(success.textContent).toMatch(/we received your request/i);
    expect(success.textContent).not.toMatch(/email/i);
    expect(success.textContent).not.toMatch(/inbox/i);
  });

  it("has a hidden honeypot field that is sent with the request and a bounded test date", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "x", status: "received", message: "Thanks — we received your request." }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ClientRequest />);
    const trap = screen.getByTestId("input-request-honeypot") as HTMLInputElement;
    expect(trap.name).toBe("hp_zx7q");
    expect(trap.autocomplete).toBe("off");
    expect(trap.tabIndex).toBe(-1);
    expect(trap.required).toBe(false);
    expect(trap.closest("[aria-hidden='true']")).toBeTruthy();
    const date = screen.getByTestId("input-request-plannedTestDate") as HTMLInputElement;
    expect(date.min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(date.max > date.min).toBe(true);

    fireEvent.change(trap, { target: { value: "spam" } });
    fireEvent.submit(screen.getByRole("button", { name: /submit guidance request/i }).closest("form")!);
    await screen.findByTestId("status-request-success");
    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.hp_zx7q).toBe("spam");
    expect(sent.website).toBeUndefined();
  });

  it("caps input lengths at the server limits", () => {
    render(<ClientRequest />);
    for (const key of ["guardianName", "email", "phone", "studentName", "currentSchool", "serviceRequested", "currentSatTotal", "referralSource"]) {
      expect((screen.getByTestId(`input-request-${key}`) as HTMLInputElement).maxLength).toBe(200);
    }
    expect((screen.getByTestId("input-request-goals") as HTMLTextAreaElement).maxLength).toBe(5000);
    expect((screen.getByTestId("input-request-availability") as HTMLTextAreaElement).maxLength).toBe(5000);
  });

  it("uses the same date-key bounds as the server", () => {
    vi.useFakeTimers({ now: new Date("2026-11-04T23:59:59.000Z"), toFake: ["Date"] });
    try {
      render(<ClientRequest />);
      const date = screen.getByTestId("input-request-plannedTestDate") as HTMLInputElement;
      expect(date.min).toBe("2025-11-04");
      expect(date.max).toBe("2029-11-04");
    } finally {
      vi.useRealTimers();
    }
  });
});
