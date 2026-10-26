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
    expect(screen.queryByRole("button", { name: "Save weekly hours" })).toBeNull();
    expect(mocks.customFetch).not.toHaveBeenCalled();
  });

  test("warns on overlapping windows and offers an end at midnight", async () => {
    mocks.customFetch.mockResolvedValueOnce(saved);
    render(<TutorDateHoursEditor />);
    expect(await screen.findByText(/Google Calendar is busy/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    const end = screen.getByLabelText("End time 1") as HTMLSelectElement;
    expect(Array.from(end.options).some((option) => option.value === "24:00" && option.textContent === "12:00 AM")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    expect(screen.getByTestId("tutor-date-hours-overlap").textContent).toContain("These windows overlap");
    expect((screen.getByRole("button", { name: "Save this date" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("saves a weekly schedule and can delete one weekday", async () => {
    const withMonday = {
      ...saved,
      recurringHours: {
        startDate: "2026-10-26",
        endDate: "2026-12-31",
        days: {
          "1": [{ start: "21:00", end: "22:00" }],
          "2": [{ start: "21:00", end: "23:00" }],
        },
      },
    };
    mocks.customFetch.mockResolvedValueOnce(saved);
    render(<TutorDateHoursEditor />);
    expect(await screen.findByText("No weekly schedule saved.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Optional start date"), { target: { value: "2026-10-26" } });
    fireEvent.change(screen.getByLabelText("Optional end date"), { target: { value: "2026-12-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a weekly window" }));
    fireEvent.change(screen.getByLabelText("Weekly end time 1"), { target: { value: "24:00" } });
    mocks.customFetch.mockResolvedValueOnce(withMonday);
    fireEvent.click(screen.getByRole("button", { name: "Save weekly hours" }));

    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenLastCalledWith("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({
          recurringHours: {
            startDate: "2026-10-26",
            endDate: "2026-12-31",
            days: { "1": [{ start: "21:00", end: "24:00" }] },
          },
        }),
      });
    });

    mocks.customFetch.mockResolvedValueOnce({
      ...withMonday,
      recurringHours: {
        startDate: "2026-10-26",
        endDate: "2026-12-31",
        days: { "2": [{ start: "21:00", end: "23:00" }] },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Monday" }));
    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenLastCalledWith("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({
          recurringHours: {
            startDate: "2026-10-26",
            endDate: "2026-12-31",
            days: { "2": [{ start: "21:00", end: "23:00" }] },
          },
        }),
      });
    });
  });

  test("shows every date closed until she saves hours", async () => {
    const closed = {
      ...saved,
      today: "2026-10-26",
      editorDates: ["2026-10-26", "2026-10-27", "2026-11-16"],
      dateHours: {
        "2026-10-26": [],
        "2026-10-27": [],
        "2026-11-02": [],
        "2099-12-31": [],
      },
      recurringHours: { startDate: null, endDate: null, days: {} },
    };
    mocks.customFetch.mockResolvedValueOnce(closed);
    render(<TutorDateHoursEditor />);

    expect(await screen.findByTestId("tutor-date-hours-all-closed")).toBeTruthy();
    expect(screen.getByTestId("tutor-date-hours-all-closed").textContent).toBe(
      "All your dates are closed. Students can't book you until you add hours for a date and save it.",
    );
    const editor = screen.getByTestId("tutor-date-hours-editor");
    expect(editor.textContent).toContain("Mon, Oct 26 — Closed");
    expect(editor.textContent).toContain("Tue, Oct 27 — Closed");
    expect(editor.textContent).toContain("Mon, Nov 16 — Closed");
    expect(editor.textContent).not.toContain("Open, bookable");
    expect(screen.getByTestId("tutor-date-hours-saved").textContent).toContain("CLOSED");
    expect(screen.getByTestId("tutor-date-hours-saved").textContent).toContain("This date is closed.");
    expect(screen.getByTestId("tutor-weekly-hours-status").textContent).toContain("No weekly schedule is active.");
    expect(screen.getByTestId("tutor-weekly-hours-status").textContent).not.toMatch(/applies on dates/i);
    expect(screen.getByRole("option", { name: "Mon, Oct 26 — Closed" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    mocks.customFetch.mockResolvedValueOnce({
      ...closed,
      dateHours: {
        ...closed.dateHours,
        "2026-10-26": [{ start: "16:00", end: "17:00" }],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save this date" }));

    await waitFor(() => {
      expect(screen.queryByTestId("tutor-date-hours-all-closed")).toBeNull();
    });
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-26").textContent).toContain("Open, bookable");
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-26").textContent).toContain("4:00 PM");
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-27").textContent).toContain("Closed");
    expect(screen.getByTestId("tutor-date-hours-saved").textContent).toContain("Students can book this date.");
  });

  test("a saved weekly schedule shows unset dates as open and keeps a closed date closed", () => {
    render(
      <TutorDateHoursEditor
        preview={{
          ...saved,
          today: "2026-10-26",
          editorDates: ["2026-10-26", "2026-11-02", "2026-11-16"],
          dateHours: {
            "2026-10-26": [],
            "2026-11-02": [],
          },
          recurringHours: {
            startDate: null,
            endDate: null,
            days: { "1": [{ start: "21:00", end: "22:00" }] },
          },
        }}
      />,
    );

    expect(screen.queryByTestId("tutor-date-hours-all-closed")).toBeNull();
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-26").textContent).toContain("Closed");
    expect(screen.getByTestId("tutor-date-hours-day-2026-11-02").textContent).toContain("Closed");
    expect(screen.getByTestId("tutor-date-hours-day-2026-11-16").textContent).toContain("Open, bookable");
    expect(screen.getByTestId("tutor-date-hours-day-2026-11-16").textContent).toContain("9:00 PM");
    expect(screen.getByTestId("tutor-weekly-hours-status").textContent).toContain("bookable on dates you have not closed");
    expect(screen.queryByText("No weekly schedule is active.")).toBeNull();
  });

  test("preview lists a weekly schedule without edit controls", () => {
    render(
      <TutorDateHoursEditor
        preview={{
          ...saved,
          recurringHours: {
            startDate: "2026-10-26",
            endDate: null,
            days: { "1": [{ start: "21:00", end: "22:00" }] },
          },
        }}
      />,
    );
    expect(screen.getByTestId("tutor-weekly-hours-saved").textContent).toContain("Monday");
    expect(screen.getByTestId("tutor-weekly-hours-saved").textContent).toContain("9:00 PM");
    expect(screen.queryByRole("button", { name: "Edit Monday" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Monday" })).toBeNull();
  });
});
