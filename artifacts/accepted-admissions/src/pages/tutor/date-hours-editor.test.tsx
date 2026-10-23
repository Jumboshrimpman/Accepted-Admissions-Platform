import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: mocks.customFetch,
}));

import { TutorDateHoursEditor } from "./date-hours-editor";

const saved = {
  tutorProfileId: "46d7cfee-d0c0-4bad-93e7-d79907301684",
  timezone: "America/New_York",
  today: "2026-10-22",
  latestDate: "2027-01-20",
  editorDates: ["2026-10-22", "2026-10-23"],
  dateHours: {
    "2026-10-22": [],
    "2026-10-23": [{ start: "10:00", end: "11:00" }],
    "2099-12-31": [],
  },
};

afterEach(() => {
  cleanup();
  mocks.customFetch.mockReset();
});

describe("tutor date hours editor", () => {
  test("hides the card when the signed-in tutor is not allowed", async () => {
    mocks.customFetch.mockRejectedValue({ status: 403 });
    render(<TutorDateHoursEditor />);
    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenCalledWith("/api/tutor/date-hours");
    });
    expect(screen.queryByTestId("tutor-date-hours-editor")).toBeNull();
  });

  test("shows the saved date, keeps other dates, and saves only the edited date", async () => {
    mocks.customFetch.mockResolvedValueOnce(saved);
    render(<TutorDateHoursEditor />);

    expect(await screen.findByTestId("tutor-date-hours-editor")).toBeTruthy();
    expect(screen.getByTestId("tutor-date-hours-saved").textContent).toContain("This date is closed.");
    expect(screen.getByTestId("tutor-date-hours-other-dates").textContent).toContain("Fri, Oct 23");
    expect(screen.getByTestId("tutor-date-hours-other-dates").textContent).toContain("10:00 AM");
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).toContain("Eastern Time");
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/@/);

    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    mocks.customFetch.mockResolvedValueOnce({
      ...saved,
      dateHours: {
        ...saved.dateHours,
        "2026-10-22": [{ start: "16:00", end: "17:00" }],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save this date" }));

    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenCalledWith("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({
          dateHours: { "2026-10-22": [{ start: "16:00", end: "17:00" }] },
        }),
      });
    });
    expect(screen.getByTestId("tutor-date-hours-other-dates").textContent).toContain("10:00 AM");

    fireEvent.click(screen.getByRole("button", { name: "Remove window 1" }));
    mocks.customFetch.mockResolvedValueOnce(saved);
    fireEvent.click(screen.getByRole("button", { name: "Mark this date closed" }));
    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenLastCalledWith("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({ dateHours: { "2026-10-22": [] } }),
      });
    });
  });

  test("preview shows saved hours and does not offer a save", () => {
    render(<TutorDateHoursEditor preview={saved} />);

    expect(screen.getByText("Set your bookable hours")).toBeTruthy();
    expect(screen.getByTestId("tutor-date-hours-saved").textContent).toContain("This date is closed.");
    expect(screen.getByTestId("tutor-date-hours-other-dates").textContent).toContain("10:00 AM");
    expect(screen.queryByRole("button", { name: "Save this date" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a window" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark this date closed" })).toBeNull();
    expect(mocks.customFetch).not.toHaveBeenCalled();
  });
});
