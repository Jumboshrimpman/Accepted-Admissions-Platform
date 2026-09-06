import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: mocks.customFetch,
}));

import { PortalProfileEditor } from "./portal-profile-editor";

afterEach(() => {
  cleanup();
  mocks.customFetch.mockReset();
});

describe("PortalProfileEditor", () => {
  it("saves title and picture so they persist on reload", async () => {
    const onSaved = vi.fn();
    mocks.customFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/me" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return {
          displayName: body.displayName,
          title: body.title,
          avatarUrl: body.avatarUrl,
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <PortalProfileEditor
        open
        onOpenChange={() => {}}
        profile={{
          displayName: "Accepted Admissions user",
          title: null,
          avatarUrl: null,
        }}
        clerkName="Sama Noori"
        onSaved={onSaved}
      />,
    );

    expect(screen.getByTestId("portal-profile-name")).toHaveProperty("value", "Sama Noori");
    fireEvent.change(screen.getByTestId("portal-profile-title"), {
      target: { value: "Founder" },
    });
    fireEvent.change(screen.getByTestId("portal-profile-photo"), {
      target: { value: "https://example.com/sama.jpg" },
    });
    fireEvent.click(screen.getByTestId("portal-profile-save"));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith({
        displayName: "Sama Noori",
        title: "Founder",
        avatarUrl: "https://example.com/sama.jpg",
      });
    });

    const patchCall = mocks.customFetch.mock.calls.find(
      ([path, init]) => path === "/api/me" && init?.method === "PATCH",
    );
    expect(patchCall?.[1]?.body).toContain("Founder");
    expect(patchCall?.[1]?.body).toContain("https://example.com/sama.jpg");
  });
});
