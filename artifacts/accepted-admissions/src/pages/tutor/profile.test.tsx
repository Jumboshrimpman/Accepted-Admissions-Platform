import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: mocks.customFetch,
}));

import TutorProfilePage from "./profile";

afterEach(() => {
  cleanup();
  mocks.customFetch.mockReset();
});

describe("tutor profile page", () => {
  test("loads the profile and saves name and photo changes", async () => {
    mocks.customFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/tutor/profile" && (!init || !init.method || init.method === "GET")) {
        return {
          id: "profile-1",
          email: "tutor@example.invalid",
          name: "Original Name",
          title: "SAT Tutor",
          photoUrl: null,
          photoAltText: null,
          biography: "Biography on file.",
          subjects: ["SAT"],
          linkedinUrl: null,
          publicApproved: false,
          active: true,
          bookingEligible: true,
        };
      }
      if (path === "/api/tutor/profile" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return {
          id: "profile-1",
          email: "tutor@example.invalid",
          name: body.name,
          title: body.title,
          photoUrl: body.photoUrl,
          photoAltText: body.photoAltText,
          biography: body.biography,
          subjects: body.subjects,
          linkedinUrl: body.linkedinUrl,
          publicApproved: false,
          active: true,
          bookingEligible: true,
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<TutorProfilePage />);

    expect(await screen.findByDisplayValue("Original Name")).toBeTruthy();

    fireEvent.change(screen.getByTestId("tutor-profile-name"), {
      target: { value: "Updated Name" },
    });
    fireEvent.change(screen.getByTestId("tutor-profile-photo"), {
      target: { value: "https://example.com/photo.jpg" },
    });
    fireEvent.change(screen.getByTestId("tutor-profile-photo-alt"), {
      target: { value: "Updated Name headshot" },
    });
    fireEvent.click(screen.getByTestId("tutor-profile-save"));

    await waitFor(() => {
      expect(screen.getByText("Your name and photo on file were saved.")).toBeTruthy();
    });

    const patchCall = mocks.customFetch.mock.calls.find(
      ([path, init]) => path === "/api/tutor/profile" && init?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      name: "Updated Name",
      photoUrl: "https://example.com/photo.jpg",
      photoAltText: "Updated Name headshot",
    });
  });
});
