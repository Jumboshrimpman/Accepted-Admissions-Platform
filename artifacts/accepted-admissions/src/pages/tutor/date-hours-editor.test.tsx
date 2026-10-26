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

  test("lists only open dates and can add hours on any date", async () => {
    mocks.customFetch.mockResolvedValueOnce(saved);
    render(<TutorDateHoursEditor />);

    expect(await screen.findByTestId("tutor-date-hours-editor")).toBeTruthy();
    expect(screen.getByTestId("tutor-date-hours-status").textContent).toBe(
      "Students can book you on 1 date.",
    );
    expect(screen.getByTestId("tutor-date-hours-open-dates").textContent).toContain("Fri, Oct 23");
    expect(screen.getByTestId("tutor-date-hours-open-dates").textContent).toContain("10:00 AM");
    expect(screen.queryByTestId("tutor-date-hours-day-2026-10-22")).toBeNull();
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).toContain("Eastern Time");
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/closed/i);
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/@/);
    expect(screen.getByRole("option", { name: "Thu, Oct 22" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Fri, Oct 23" })).toBeTruthy();
    expect((screen.getByLabelText("Date") as HTMLSelectElement).value).toBe("2026-10-23");

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-22" } });
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/closed/i);
    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    mocks.customFetch.mockResolvedValueOnce({
      ...saved,
      dateHours: {
        ...saved.dateHours,
        "2026-10-22": [{ start: "16:00", end: "17:00" }],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));

    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenCalledWith("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({
          dateHours: { "2026-10-22": [{ start: "16:00", end: "17:00" }] },
        }),
      });
    });
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-22").textContent).toContain("4:00 PM");
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-23").textContent).toContain("10:00 AM");

    fireEvent.click(screen.getByRole("button", { name: "Remove window 1" }));
    mocks.customFetch.mockResolvedValueOnce(saved);
    fireEvent.click(screen.getByRole("button", { name: "Remove hours" }));
    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenLastCalledWith("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({ dateHours: { "2026-10-22": [] } }),
      });
    });
    expect(screen.queryByTestId("tutor-date-hours-day-2026-10-22")).toBeNull();
  });

  test("preview shows open hours and does not offer a save", () => {
    render(<TutorDateHoursEditor preview={saved} />);

    expect(screen.getByText("Set your bookable hours")).toBeTruthy();
    expect(screen.getByTestId("tutor-date-hours-status").textContent).toBe(
      "Students can book you on 1 date.",
    );
    expect(screen.getByTestId("tutor-date-hours-open-dates").textContent).toContain("10:00 AM");
    expect(screen.queryByTestId("tutor-date-hours-day-2026-10-22")).toBeNull();
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/closed/i);
    expect(screen.queryByRole("button", { name: "Save hours" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a window" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove hours" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save weekly hours" })).toBeNull();
    expect(screen.queryByLabelText("Date")).toBeNull();
    expect(mocks.customFetch).not.toHaveBeenCalled();
  });

  test("warns on overlapping windows and offers an end at midnight", async () => {
    mocks.customFetch.mockResolvedValueOnce({
      ...saved,
      dateHours: { "2026-10-22": [], "2026-10-23": [] },
    });
    render(<TutorDateHoursEditor />);
    expect(await screen.findByRole("button", { name: "Add a window" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    const end = screen.getByLabelText("End time 1") as HTMLSelectElement;
    expect(Array.from(end.options).some((option) => option.value === "24:00" && option.textContent === "12:00 AM")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    expect(screen.getByTestId("tutor-date-hours-overlap").textContent).toContain("These windows overlap");
    expect((screen.getByRole("button", { name: "Save hours" }) as HTMLButtonElement).disabled).toBe(true);
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

  test("shows a neutral line until she saves hours, with no closed rows", async () => {
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

    expect(await screen.findByTestId("tutor-date-hours-status")).toBeTruthy();
    expect(screen.getByTestId("tutor-date-hours-status").textContent).toBe(
      "No open hours yet. Students can't book you until you add some.",
    );
    expect(screen.queryByTestId("tutor-date-hours-open-dates")).toBeNull();
    expect(screen.queryByRole("button", { name: /closed dates/i })).toBeNull();
    expect(screen.getByRole("option", { name: "Mon, Oct 26" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Tue, Oct 27" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Mon, Nov 16" })).toBeTruthy();
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/closed/i);
    expect(screen.getByTestId("tutor-weekly-hours-status").textContent).toContain("No weekly schedule saved.");
    expect((screen.getByLabelText("Date") as HTMLSelectElement).value).toBe("2026-10-26");

    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    mocks.customFetch.mockResolvedValueOnce({
      ...closed,
      dateHours: {
        ...closed.dateHours,
        "2026-10-26": [{ start: "16:00", end: "17:00" }],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));

    await waitFor(() => {
      expect(screen.getByTestId("tutor-date-hours-status").textContent).toBe(
        "Students can book you on 1 date.",
      );
    });
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-26").textContent).toContain("4:00 PM");
    expect(screen.queryByTestId("tutor-date-hours-day-2026-10-27")).toBeNull();
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/closed/i);
  });

  test("a saved weekly schedule lists only the dates it opens", () => {
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

    expect(screen.getByTestId("tutor-date-hours-status").textContent).toBe(
      "Students can book you on 1 date.",
    );
    expect(screen.queryByTestId("tutor-date-hours-day-2026-10-26")).toBeNull();
    expect(screen.queryByTestId("tutor-date-hours-day-2026-11-02")).toBeNull();
    expect(screen.getByTestId("tutor-date-hours-day-2026-11-16").textContent).toContain("9:00 PM");
    expect(screen.getByTestId("tutor-weekly-hours-status").textContent).toContain(
      "Repeats on dates you have not set yourself.",
    );
    expect(screen.queryByText("No weekly schedule saved.")).toBeNull();
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/closed/i);
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

  test("edit loads an open date and remove clears it", async () => {
    const hours = {
      ...saved,
      today: "2026-10-26",
      editorDates: ["2026-10-26", "2026-10-27", "2026-11-02"],
      dateHours: {
        "2026-10-26": [],
        "2026-10-27": [{ start: "18:00", end: "19:00" }],
        "2026-11-02": [],
        "2099-12-31": [],
      },
      recurringHours: { startDate: null, endDate: null, days: {} },
    };
    const { unmount } = render(<TutorDateHoursEditor preview={hours} />);
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-27").textContent).toContain("6:00 PM");
    expect(screen.queryByTestId("tutor-date-hours-day-2026-10-26")).toBeNull();
    expect(screen.queryByTestId("tutor-date-hours-day-2026-11-02")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save hours" })).toBeNull();
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/closed/i);
    unmount();

    mocks.customFetch.mockResolvedValueOnce(hours);
    render(<TutorDateHoursEditor />);
    expect(await screen.findByRole("button", { name: "Edit Tue, Oct 27" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit Tue, Oct 27" }));
    expect((screen.getByLabelText("Date") as HTMLSelectElement).value).toBe("2026-10-27");
    expect((screen.getByLabelText("Start time 1") as HTMLSelectElement).value).toBe("18:00");

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-02" } });
    expect(screen.getByTestId("tutor-date-hours-editor").textContent).not.toMatch(/closed/i);
    fireEvent.click(screen.getByRole("button", { name: "Add a window" }));
    mocks.customFetch.mockResolvedValueOnce({
      ...hours,
      dateHours: {
        ...hours.dateHours,
        "2026-11-02": [{ start: "16:00", end: "17:00" }],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save hours" }));
    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenLastCalledWith("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({
          dateHours: { "2026-11-02": [{ start: "16:00", end: "17:00" }] },
        }),
      });
    });
    expect(screen.getByTestId("tutor-date-hours-day-2026-11-02").textContent).toContain("4:00 PM");
    expect(screen.getByTestId("tutor-date-hours-day-2026-10-27").textContent).toContain("6:00 PM");
    expect(screen.queryByTestId("tutor-date-hours-day-2026-10-26")).toBeNull();

    mocks.customFetch.mockResolvedValueOnce({
      ...hours,
      dateHours: {
        ...hours.dateHours,
        "2026-10-27": [],
        "2026-11-02": [{ start: "16:00", end: "17:00" }],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove Tue, Oct 27" }));
    await waitFor(() => {
      expect(mocks.customFetch).toHaveBeenLastCalledWith("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({ dateHours: { "2026-10-27": [] } }),
      });
    });
    expect(screen.queryByTestId("tutor-date-hours-day-2026-10-27")).toBeNull();
  });
});
