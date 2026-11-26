import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  OfferedAvailabilityCalendar,
  addCivilDays,
  calendarDayBounds,
  formatWeekRangeLabel,
  gridWindow,
  initialFocusDay,
  placeOfferedSlots,
  startOfWeekKey,
  weekDayKeys,
} from "./offered-availability-calendar";

const TIMEZONE = "America/New_York";
const OCTOBER_NOW = new Date("2026-11-26T15:00:00.000Z");
const TUESDAY_3PM = "2026-10-20T19:00:00.000Z";
const TUESDAY_5PM = "2026-10-20T21:00:00.000Z";
const NEXT_TUESDAY_3PM = "2026-10-27T19:00:00.000Z";
const MONDAY_NIGHT = "2026-10-27T01:00:00.000Z";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

afterEach(() => {
  cleanup();
  if (originalMatchMedia) Object.defineProperty(window, "matchMedia", originalMatchMedia);
  else delete (window as { matchMedia?: unknown }).matchMedia;
});

function renderCalendar(
  overrides: Partial<Parameters<typeof OfferedAvailabilityCalendar>[0]> = {},
) {
  return render(
    <OfferedAvailabilityCalendar
      timezone={TIMEZONE}
      from="2026-10-17T14:00:00.000Z"
      to="2026-10-31T14:00:00.000Z"
      now={OCTOBER_NOW}
      layout="week"
      lengths={[
        { durationMinutes: 60, slots: [TUESDAY_3PM, NEXT_TUESDAY_3PM] },
        { durationMinutes: 90, slots: [] },
        { durationMinutes: 120, slots: [TUESDAY_3PM, TUESDAY_5PM] },
      ]}
      {...overrides}
    />,
  );
}

function slotStarts(): string[] {
  return [...document.querySelectorAll("[data-testid='offered-availability-slot']")].map(
    (node) => node.getAttribute("data-start") ?? "",
  );
}

describe("offered availability calendar math", () => {
  test("civil weeks stay on the tutor's calendar, including month and year boundaries", () => {
    expect(addCivilDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addCivilDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(startOfWeekKey("2026-10-20")).toBe("2026-10-18");
    expect(weekDayKeys("2026-10-18")).toEqual([
      "2026-10-18",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]);
    expect(formatWeekRangeLabel("2026-10-18")).toBe("Oct 18 – 24, 2026");
    expect(formatWeekRangeLabel("2026-11-29")).toBe("Nov 29 – Dec 5, 2026");
    expect(formatWeekRangeLabel("2026-12-27")).toBe("Dec 27, 2026 – Jan 2, 2027");
  });

  test("opens on the earliest offered day when today is outside that week", () => {
    expect(
      initialFocusDay({
        timezone: TIMEZONE,
        from: "2026-10-17T14:00:00.000Z",
        slots: [TUESDAY_3PM, NEXT_TUESDAY_3PM],
        now: OCTOBER_NOW,
      }),
    ).toBe("2026-10-20");
    expect(
      initialFocusDay({
        timezone: TIMEZONE,
        from: "2026-10-17T14:00:00.000Z",
        slots: [TUESDAY_3PM],
        now: new Date("2026-10-20T15:00:00.000Z"),
      }),
    ).toBe("2026-10-20");
    expect(
      calendarDayBounds({
        timezone: TIMEZONE,
        from: "2026-10-17T14:00:00.000Z",
        to: "2026-10-31T14:00:00.000Z",
        slots: [TUESDAY_3PM],
        now: OCTOBER_NOW,
      }),
    ).toEqual({ firstDay: "2026-10-17", lastDay: "2026-11-26" });
  });

  test("places the given starts in the tutor timezone and does not invent slots", () => {
    const placed = placeOfferedSlots(
      [TUESDAY_3PM, TUESDAY_3PM, "2026-10-20T19:30:00.000Z"],
      60,
      TIMEZONE,
    );
    expect(placed.map((slot) => slot.iso)).toEqual([TUESDAY_3PM, "2026-10-20T19:30:00.000Z"]);
    expect(placed.every((slot) => slot.dayKey === "2026-10-20")).toBe(true);
    expect(placed.find((slot) => slot.iso === TUESDAY_3PM)?.startMinutes).toBe(15 * 60);
    expect(placed.every((slot) => slot.laneCount === 2)).toBe(true);

    const evening = placeOfferedSlots([MONDAY_NIGHT], 60, TIMEZONE);
    expect(evening).toEqual([
      expect.objectContaining({
        iso: MONDAY_NIGHT,
        dayKey: "2026-10-26",
        startMinutes: 21 * 60,
        endMinutes: 22 * 60,
        lane: 0,
        laneCount: 1,
      }),
    ]);

    expect(gridWindow([])).toEqual({ start: 7 * 60, end: 21 * 60 });
    expect(gridWindow([{ startMinutes: 6 * 60, endMinutes: 7 * 60 }]).start).toBe(6 * 60);
    expect(gridWindow([{ startMinutes: 20 * 60, endMinutes: 22 * 60 }]).end).toBe(22 * 60);
  });
});

describe("offered availability calendar", () => {
  test("shows one week of the same bookable starts, then the next week", () => {
    renderCalendar();

    expect(screen.getByTestId("offered-availability-range").textContent).toBe("Oct 18 – 24, 2026");
    expect(screen.getByTestId("offered-availability-timezone").textContent).toContain(
      "Time zone: ET (America/New_York)",
    );
    expect(screen.getAllByTestId(/offered-availability-column-/)).toHaveLength(7);
    expect(slotStarts()).toEqual([TUESDAY_3PM]);
    expect(screen.getByTestId("offered-availability-column-2026-10-20").textContent).toContain(
      "Tuesday, October 20, 2026",
    );
    const block = screen.getByTestId("offered-availability-slot");
    expect(block.textContent).toContain("3:00 PM");
    expect(block.getAttribute("data-duration")).toBe("60");
    expect(block.getAttribute("data-start-minutes")).toBe(String(15 * 60));

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByTestId("offered-availability-range").textContent).toBe("Oct 25 – 31, 2026");
    expect(slotStarts()).toEqual([NEXT_TUESDAY_3PM]);

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(slotStarts()).toEqual([TUESDAY_3PM]);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByTestId("offered-availability-range").textContent).toBe("Nov 22 – 28, 2026");
    expect(slotStarts()).toEqual([]);
    expect(screen.getByTestId("offered-availability-empty").textContent).toBe(
      "No open times this week.",
    );
  });

  test("keeps an off-hour start on its tutor-timezone day", () => {
    renderCalendar({
      lengths: [{ durationMinutes: 60, slots: ["2026-10-21T22:05:00.000Z"] }],
    });

    const block = screen.getByTestId("offered-availability-slot");
    expect(block.getAttribute("data-day")).toBe("2026-10-21");
    expect(block.getAttribute("data-start-minutes")).toBe(String(18 * 60 + 5));
    expect(block.textContent).toContain("6:05 PM");
    expect(block.closest("[data-day-column='2026-10-21']")).toBeTruthy();
    expect(document.querySelector("[data-day-column='2026-10-22'] [data-testid='offered-availability-slot']")).toBeNull();
  });

  test("an evening slot stays on the previous tutor date when UTC has already rolled over", () => {
    renderCalendar({
      lengths: [{ durationMinutes: 60, slots: [MONDAY_NIGHT] }],
    });

    expect(screen.getByTestId("offered-availability-slot").getAttribute("data-day")).toBe(
      "2026-10-26",
    );
    expect(screen.getByTestId("offered-availability-slot").textContent).toContain("9:00 PM");
    expect(
      document.querySelector("[data-day-column='2026-10-26'] [data-testid='offered-availability-slot']"),
    ).toBeTruthy();
    expect(
      document.querySelector("[data-day-column='2026-10-27'] [data-testid='offered-availability-slot']"),
    ).toBeNull();
  });

  test("disables week navigation at the edges of the offered range", () => {
    renderCalendar({
      from: "2026-10-18T14:00:00.000Z",
      to: "2026-10-25T04:00:00.000Z",
      now: new Date("2026-10-20T15:00:00.000Z"),
      lengths: [{ durationMinutes: 60, slots: [TUESDAY_3PM] }],
    });

    expect(screen.getByRole("button", { name: "Previous week" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Next week" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(slotStarts()).toEqual([TUESDAY_3PM]);
  });

  test("a session length with no starts says so without drawing blocks", () => {
    renderCalendar();
    fireEvent.click(screen.getByRole("button", { name: /1\.5 hours/ }));
    expect(screen.getByTestId("offered-availability-empty").textContent).toBe("No open times");
    expect(slotStarts()).toEqual([]);
  });

  test("the day view shows one day and moves a day at a time", () => {
    renderCalendar({ layout: "day" });

    expect(screen.getByTestId("offered-availability-calendar").getAttribute("data-layout")).toBe(
      "day",
    );
    expect(screen.getByTestId("offered-availability-range").textContent).toBe(
      "Tuesday, October 20, 2026",
    );
    expect(screen.getAllByTestId(/offered-availability-column-/)).toHaveLength(1);
    expect(slotStarts()).toEqual([TUESDAY_3PM]);
    expect(screen.getByRole("button", { name: "Previous day" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next day" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByTestId("offered-availability-range").textContent).toBe(
      "Wednesday, October 21, 2026",
    );
    expect(slotStarts()).toEqual([]);
    expect(screen.getByTestId("offered-availability-empty").textContent).toBe(
      "No open times this day.",
    );

    fireEvent.click(screen.getByTestId("offered-availability-day-2026-10-20"));
    expect(slotStarts()).toEqual([TUESDAY_3PM]);
    expect(screen.getByTestId("offered-availability-range").textContent).toBe(
      "Tuesday, October 20, 2026",
    );
  });

  test("a viewport narrower than 768px uses the day view", () => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      addListener: () => {},
      removeListener: () => {},
    })) as unknown as typeof window.matchMedia;

    renderCalendar({ layout: undefined });

    expect(screen.getByTestId("offered-availability-calendar").getAttribute("data-layout")).toBe(
      "day",
    );
    expect(screen.getByRole("button", { name: "Previous day" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous week" })).toBeTruthy();
  });

  test("a wide viewport keeps the week grid", () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("768px"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      addListener: () => {},
      removeListener: () => {},
    })) as unknown as typeof window.matchMedia;

    renderCalendar({ layout: undefined });

    expect(screen.getByTestId("offered-availability-calendar").getAttribute("data-layout")).toBe(
      "week",
    );
    expect(screen.queryByRole("button", { name: "Previous day" })).toBeNull();
    expect(screen.getAllByTestId(/offered-availability-column-/)).toHaveLength(7);
  });
});
