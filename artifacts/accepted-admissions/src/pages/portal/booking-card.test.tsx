import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { format, parseISO } from "date-fns";

const originalTimezone = process.env.TZ;
process.env.TZ = "America/New_York";

const mocks = vi.hoisted(() => ({
  queryClient: {
    invalidateQueries: vi.fn(),
  },
  tutorsQuery: {
    data: [
      {
        id: "tutor-xavier",
        name: "Xavier Morales",
        title: "SAT Tutor",
        photoUrl: null,
        biography: "Xavier helps students strengthen SAT reasoning.",
        subjects: ["SAT", "Math"],
        calendarStatus: "connected",
        providerStatus: "connected",
      },
    ],
    isLoading: false,
  },
  sessionsQuery: {
    data: [],
    isLoading: false,
  },
  availabilityQuery: {
    data: null as null | {
      tutor: { timezone: string };
      providerStatus: "connected" | "disconnected";
      slots: string[];
    },
    isLoading: false,
  },
  createBooking: {
    isPending: false,
    mutate: vi.fn(),
  },
  cancelBooking: {
    isPending: false,
    mutate: vi.fn(),
  },
  rescheduleBooking: {
    isPending: false,
    mutate: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mocks.queryClient,
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetBookingAvailabilityQueryKey: () => ["availability"],
  getListBookingSessionsQueryKey: () => ["sessions"],
  useCancelBookingSession: () => mocks.cancelBooking,
  useCreateBookingSession: () => mocks.createBooking,
  useGetBookingAvailability: () => mocks.availabilityQuery,
  useListBookingSessions: () => mocks.sessionsQuery,
  useListBookingTutors: () => mocks.tutorsQuery,
  useRescheduleBookingSession: () => mocks.rescheduleBooking,
}));

import { BookingCard } from "./booking-card";

const tutorTimezone = "Asia/Tokyo";
const firstSlotInstant = new Date();
firstSlotInstant.setUTCDate(firstSlotInstant.getUTCDate() + 2);
firstSlotInstant.setUTCHours(15, 30, 0, 0);
const secondSlotInstant = new Date(firstSlotInstant);
secondSlotInstant.setUTCDate(secondSlotInstant.getUTCDate() + 2);
secondSlotInstant.setUTCHours(23, 0, 0, 0);
const firstSlot = firstSlotInstant.toISOString();
const secondSlot = secondSlotInstant.toISOString();

function tutorDayKey(value: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tutorTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parseISO(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function calendarDate(value: string): Date {
  return parseISO(`${tutorDayKey(value)}T12:00:00`);
}

function tutorTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tutorTimezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(parseISO(value));
}

const firstSlotDate = calendarDate(firstSlot);
const secondSlotDate = calendarDate(secondSlot);

function dayButton(date: Date): HTMLButtonElement | null {
  return document.querySelector(
    `button[data-day="${date.toLocaleDateString()}"]`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tutorsQuery.data = [
    {
      id: "tutor-xavier",
      name: "Xavier Morales",
      title: "SAT Tutor",
      photoUrl: null,
      biography: "Xavier helps students strengthen SAT reasoning.",
      subjects: ["SAT", "Math"],
      calendarStatus: "connected",
      providerStatus: "connected",
    },
  ];
  mocks.availabilityQuery.data = {
    tutor: { timezone: tutorTimezone },
    providerStatus: "connected",
    slots: [firstSlot, secondSlot],
  };
  mocks.availabilityQuery.isLoading = false;
  mocks.sessionsQuery.data = [];
  mocks.sessionsQuery.isLoading = false;
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  process.env.TZ = originalTimezone;
});

describe("client availability calendar", () => {
  test("shows enabled bookable dates, filters times by date, and preserves reserve action", async () => {
    render(<BookingCard />);
    fireEvent.click(screen.getByRole("button", { name: /Xavier Morales/i }));

    await waitFor(() => {
      expect(screen.getByText("Available times with Xavier Morales")).toBeTruthy();
    });

    const unavailableDate = new Date(firstSlotDate);
    unavailableDate.setDate(unavailableDate.getDate() + 1);
    expect(dayButton(firstSlotDate)?.hasAttribute("disabled")).toBe(false);
    expect(dayButton(unavailableDate)?.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(format(firstSlotDate, "EEEE, MMM d"))).toBeTruthy();
    expect(screen.getByText("12:30 AM")).toBeTruthy();
    expect(screen.queryByText(tutorTime(secondSlot))).toBeNull();

    fireEvent.click(dayButton(secondSlotDate)!);
    expect(screen.getByText(tutorTime(secondSlot))).toBeTruthy();
    expect(screen.queryByText(tutorTime(firstSlot))).toBeNull();

    fireEvent.click(screen.getByText(tutorTime(secondSlot)));
    expect(screen.getByRole("button", { name: "Reserve this hour" })).toBeTruthy();
    const hint = screen.getByTestId("booking-calendar-hint");
    expect(hint.textContent).toMatch(/Dates with open times are available to select/);
    expect(hint.className).toMatch(/mt-3/);
    expect(screen.getByTestId("booking-calendar").className).toMatch(/overflow-visible/);
  });

  test("does not show a calendar when the provider is disconnected", () => {
    mocks.availabilityQuery.data = {
      tutor: { timezone: tutorTimezone },
      providerStatus: "disconnected",
      slots: [],
    };

    render(<BookingCard />);
    fireEvent.click(screen.getByRole("button", { name: /Xavier Morales/i }));

    expect(screen.getByText("This tutor needs to reconnect Google Calendar before times can be displayed.")).toBeTruthy();
    expect(screen.queryByText("Dates with open times are available to select.")).toBeNull();
  });
  test("shows tutor biography and switches calendars between tutors", async () => {
    mocks.tutorsQuery.data = [
      {
        id: "tutor-xavier",
        name: "Xavier Morales",
        title: "SAT Tutor",
        photoUrl: null,
        biography: "Xavier helps students strengthen SAT reasoning.",
        subjects: ["SAT", "Math"],
        calendarStatus: "connected",
        providerStatus: "connected",
      },
      {
        id: "tutor-eunice",
        name: "Eunice Chon",
        title: "Scholarship Tutor",
        photoUrl: null,
        biography: "Eunice coaches scholarship and admissions work.",
        subjects: ["Scholarships"],
        calendarStatus: "connected",
        providerStatus: "connected",
      },
    ];

    render(<BookingCard />);
    expect(screen.getByText("Xavier helps students strengthen SAT reasoning.")).toBeTruthy();
    expect(screen.getByText("Eunice coaches scholarship and admissions work.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Eunice Chon" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Eunice Chon" }));
    await waitFor(() => {
      expect(screen.getByText("Available times with Eunice Chon")).toBeTruthy();
    });
  });

  test("prompts a zero-credit client to buy a single hour or 10-hour package before booking", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ remainingHours: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.tutorsQuery.data = [
      {
        id: "tutor-xavier",
        name: "Xavier Morales",
        title: "SAT Tutor",
        photoUrl: null,
        biography: "Xavier helps students strengthen SAT reasoning.",
        subjects: ["SAT", "Math"],
        calendarStatus: "connected",
        providerStatus: "connected",
      },
      {
        id: "tutor-eunice",
        name: "Eunice Chon",
        title: "SAT Tutor",
        photoUrl: null,
        biography: "Eunice coaches SAT sessions.",
        subjects: ["SAT"],
        calendarStatus: "connected",
        providerStatus: "connected",
      },
    ];

    render(<BookingCard />);
    fireEvent.click(screen.getByRole("button", { name: /Xavier Morales/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Buy a single hour \(\$130\) or the 10-hour package \(\$1,300\)/),
      ).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: /Purchase SAT hours/i }).getAttribute("href")).toBe("/portal/sat");
    expect(screen.getByRole("tab", { name: "Eunice Chon" })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  test("lists the Oct 2 Tokyo meeting as 9:00 PM JST instead of 8:00 AM Tokyo", () => {
    mocks.sessionsQuery.data = [
      {
        id: "1cc3dea5-9532-4dc2-9cea-3d1e5d65d119",
        title: "Taito’s SAT Session with Eunice",
        dateTime: "2026-10-02T12:00:00.000Z",
        timezone: "Asia/Tokyo",
        durationMinutes: 60,
        bookingStatus: "confirmed",
        tutorName: "Eunice Chon",
        tutorProfileId: "tutor-eunice",
        meetingUrl: null,
        calendarEventUrl: null,
      },
    ];

    render(<BookingCard />);

    expect(screen.getByText("Taito’s SAT Session with Eunice")).toBeTruthy();
    expect(screen.getByText(/9:00–10:00 PM JST/)).toBeTruthy();
    expect(screen.queryByText(/8:00\s*AM/)).toBeNull();
    expect(screen.queryByText(/8:00 AM.*Tokyo|Tokyo.*8:00 AM/i)).toBeNull();
  });

  test("hides cancel and reschedule for past sessions and keeps them for upcoming ones", () => {
    const pastStart = new Date();
    pastStart.setHours(pastStart.getHours() - 3);
    const futureStart = new Date();
    futureStart.setDate(futureStart.getDate() + 3);
    mocks.sessionsQuery.data = [
      {
        id: "session-past",
        title: "Past SAT session",
        dateTime: pastStart.toISOString(),
        timezone: "America/New_York",
        durationMinutes: 60,
        bookingStatus: "confirmed",
        tutorName: "Xavier Morales",
        tutorProfileId: "tutor-xavier",
        meetingUrl: null,
        calendarEventUrl: null,
      },
      {
        id: "session-future",
        title: "Upcoming SAT session",
        dateTime: futureStart.toISOString(),
        timezone: "America/New_York",
        durationMinutes: 60,
        bookingStatus: "confirmed",
        tutorName: "Xavier Morales",
        tutorProfileId: "tutor-xavier",
        meetingUrl: null,
        calendarEventUrl: null,
      },
    ];

    render(<BookingCard />);

    expect(screen.getByText("Past SAT session")).toBeTruthy();
    expect(screen.getByText("Upcoming SAT session")).toBeTruthy();
    expect(screen.getByText("Past sessions cannot be cancelled or rescheduled.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Change time/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Cancel/i })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(mocks.cancelBooking.mutate).toHaveBeenCalledWith(
      { sessionId: "session-future", data: { reason: "Cancelled by student" } },
      expect.any(Object),
    );
  });
});
