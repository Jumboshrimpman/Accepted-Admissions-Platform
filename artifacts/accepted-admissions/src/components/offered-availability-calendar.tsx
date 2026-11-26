import { useEffect, useId, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  bookingSlotDayKey,
  clientTimezoneCaption,
  formatBookingSlotTime,
  sessionDateTimeLocalValue,
} from "@/lib/session-display";

/**
 * Display-only week grid for bookable starts the booking API already returned.
 * Nothing here regenerates slots, applies buffers, or shifts a start time.
 * Civil dates are computed in the tutor timezone so a week boundary cannot
 * drift with the browser zone.
 */

export type OfferedCalendarLength = {
  durationMinutes: number;
  slots: string[];
};

export type PlacedSlot = {
  iso: string;
  dayKey: string;
  startMinutes: number;
  endMinutes: number;
  lane: number;
  laneCount: number;
};

const WEEK_LAYOUT_QUERY = "(min-width: 768px)";
const HOUR_HEIGHT_PX = 44;
const DEFAULT_GRID_START_MINUTES = 7 * 60;
const DEFAULT_GRID_END_MINUTES = 21 * 60;

export function durationLabel(minutes: number): string {
  if (minutes === 60) return "1 hour";
  if (minutes === 90) return "1.5 hours";
  if (minutes === 120) return "2 hours";
  return `${minutes} minutes`;
}

export function openTimesLabel(count: number): string {
  if (count === 0) return "No open times";
  return `${count} open ${count === 1 ? "time" : "times"}`;
}

function parseDayKey(dayKey: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function addCivilDays(dayKey: string, days: number): string {
  const parts = parseDayKey(dayKey);
  if (!parts) return dayKey;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekdayIndex(dayKey: string): number {
  const parts = parseDayKey(dayKey);
  if (!parts) return 0;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function startOfWeekKey(dayKey: string): string {
  return addCivilDays(dayKey, -weekdayIndex(dayKey));
}

export function weekDayKeys(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addCivilDays(weekStart, index));
}

function formatCivil(dayKey: string, options: Intl.DateTimeFormatOptions): string {
  const parts = parseDayKey(dayKey);
  if (!parts) return dayKey;
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day)),
  );
}

export function formatCivilDateLong(dayKey: string): string {
  return formatCivil(dayKey, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatWeekRangeLabel(weekStart: string): string {
  const days = weekDayKeys(weekStart);
  const start = days[0] ?? weekStart;
  const end = days[6] ?? weekStart;
  const startParts = parseDayKey(start);
  const endParts = parseDayKey(end);
  if (!startParts || !endParts) return weekStart;
  const startMonth = formatCivil(start, { month: "short" });
  const endMonth = formatCivil(end, { month: "short" });
  if (startParts.year === endParts.year && startParts.month === endParts.month) {
    return `${startMonth} ${startParts.day} – ${endParts.day}, ${startParts.year}`;
  }
  if (startParts.year === endParts.year) {
    return `${startMonth} ${startParts.day} – ${endMonth} ${endParts.day}, ${startParts.year}`;
  }
  return `${startMonth} ${startParts.day}, ${startParts.year} – ${endMonth} ${endParts.day}, ${endParts.year}`;
}

export function initialDuration(lengths: OfferedCalendarLength[]): number {
  return (lengths.find((length) => length.slots.length > 0) ?? lengths[0])?.durationMinutes ?? 60;
}

export function initialFocusDay(args: {
  timezone: string;
  from: string;
  slots: string[];
  now?: Date;
}): string {
  const now = args.now ?? new Date();
  const today = bookingSlotDayKey(now, args.timezone);
  const todayWeek = startOfWeekKey(today);
  const slotDays = [
    ...new Set(args.slots.map((slot) => bookingSlotDayKey(slot, args.timezone))),
  ].sort();
  const inThisWeek = slotDays.filter((day) => startOfWeekKey(day) === todayWeek);
  if (inThisWeek.length > 0) return inThisWeek.includes(today) ? today : inThisWeek[0]!;
  if (slotDays.length > 0) return slotDays[0]!;
  const fromKey = bookingSlotDayKey(args.from, args.timezone);
  return fromKey || today;
}

export function calendarDayBounds(args: {
  timezone: string;
  from: string;
  to: string;
  slots: string[];
  now?: Date;
}): { firstDay: string; lastDay: string } {
  const now = args.now ?? new Date();
  const today = bookingSlotDayKey(now, args.timezone);
  const fromKey = bookingSlotDayKey(args.from, args.timezone);
  const toInstant = new Date(args.to).getTime();
  const toKey = Number.isFinite(toInstant)
    ? bookingSlotDayKey(new Date(toInstant - 1), args.timezone)
    : fromKey;
  const slotDays = args.slots.map((slot) => bookingSlotDayKey(slot, args.timezone));
  const days = [today, fromKey, toKey, ...slotDays].filter((day) => parseDayKey(day)).sort();
  return { firstDay: days[0] ?? today, lastDay: days[days.length - 1] ?? today };
}

function slotStartMinutes(iso: string, timezone: string): { dayKey: string; minutes: number } | null {
  const local = sessionDateTimeLocalValue(iso, timezone);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour === 24) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { dayKey: match[1]!, minutes: hour * 60 + minute };
}

function assignLanes(slots: PlacedSlot[]): PlacedSlot[] {
  const ordered = [...slots].sort(
    (left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes,
  );
  const laneEnds: number[] = [];
  const withLane = ordered.map((slot) => {
    let lane = laneEnds.findIndex((end) => end <= slot.startMinutes);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(slot.endMinutes);
    } else {
      laneEnds[lane] = slot.endMinutes;
    }
    return { ...slot, lane };
  });
  const laneCount = Math.max(1, laneEnds.length);
  return withLane.map((slot) => ({ ...slot, laneCount }));
}

export function placeOfferedSlots(
  slots: string[],
  durationMinutes: number,
  timezone: string,
): PlacedSlot[] {
  const seen = new Set<string>();
  const placed: PlacedSlot[] = [];
  for (const iso of slots) {
    if (seen.has(iso)) continue;
    seen.add(iso);
    const start = slotStartMinutes(iso, timezone);
    if (!start) continue;
    placed.push({
      iso,
      dayKey: start.dayKey,
      startMinutes: start.minutes,
      endMinutes: start.minutes + durationMinutes,
      lane: 0,
      laneCount: 1,
    });
  }
  const byDay = new Map<string, PlacedSlot[]>();
  for (const slot of placed) {
    const daySlots = byDay.get(slot.dayKey) ?? [];
    daySlots.push(slot);
    byDay.set(slot.dayKey, daySlots);
  }
  return [...byDay.values()].flatMap((daySlots) => assignLanes(daySlots));
}

export function gridWindow(slots: Array<Pick<PlacedSlot, "startMinutes" | "endMinutes">>): {
  start: number;
  end: number;
} {
  let start = DEFAULT_GRID_START_MINUTES;
  let end = DEFAULT_GRID_END_MINUTES;
  for (const slot of slots) {
    start = Math.min(start, Math.floor(slot.startMinutes / 60) * 60);
    end = Math.max(end, Math.ceil(slot.endMinutes / 60) * 60);
  }
  if (end <= start) end = start + 60;
  return { start, end };
}

function formatHourLabel(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12} ${period}`;
}

function useWeekLayout(layout: "week" | "day" | undefined): boolean {
  const [matches, setMatches] = useState(() => {
    if (layout === "day") return false;
    if (layout === "week") return true;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia(WEEK_LAYOUT_QUERY).matches;
  });

  useEffect(() => {
    if (layout === "day") {
      setMatches(false);
      return;
    }
    if (layout === "week") {
      setMatches(true);
      return;
    }
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(WEEK_LAYOUT_QUERY);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [layout]);

  return matches;
}

function clampDay(day: string, firstDay: string, lastDay: string): string {
  if (day < firstDay) return firstDay;
  if (day > lastDay) return lastDay;
  return day;
}

export function OfferedAvailabilityCalendar({
  timezone,
  from,
  to,
  lengths,
  now,
  layout,
}: {
  timezone: string;
  from: string;
  to: string;
  lengths: OfferedCalendarLength[];
  /** Fixed clock for tests. The live view uses the current time. */
  now?: Date;
  /** Fixed layout for tests. The live view follows the viewport. */
  layout?: "week" | "day";
}) {
  const tablistId = useId();
  const clock = now ?? new Date();
  const weekLayout = useWeekLayout(layout);
  const [durationMinutes, setDurationMinutes] = useState(() => initialDuration(lengths));
  const [focusDay, setFocusDay] = useState(() =>
    initialFocusDay({
      timezone,
      from,
      slots:
        lengths.find((length) => length.durationMinutes === initialDuration(lengths))?.slots ??
        [],
      now: now ?? new Date(),
    }),
  );

  const selected =
    lengths.find((length) => length.durationMinutes === durationMinutes) ?? lengths[0];
  const allSlots = lengths.flatMap((length) => length.slots);
  const bounds = calendarDayBounds({ timezone, from, to, slots: allSlots, now: clock });
  const today = bookingSlotDayKey(clock, timezone);
  const weekStart = startOfWeekKey(focusDay);
  const weekDays = weekDayKeys(weekStart);
  const visibleDays = weekLayout ? weekDays : [focusDay];
  const placed = selected
    ? placeOfferedSlots(selected.slots, selected.durationMinutes, timezone)
    : [];
  const visible = placed.filter((slot) => visibleDays.includes(slot.dayKey));
  const grid = gridWindow(placed);
  const gridHeight = ((grid.end - grid.start) / 60) * HOUR_HEIGHT_PX + 10;
  const fromKey = bookingSlotDayKey(from, timezone);
  const toInstant = new Date(to).getTime();
  const toKey = Number.isFinite(toInstant)
    ? bookingSlotDayKey(new Date(toInstant - 1), timezone)
    : fromKey;
  const prevWeekDisabled = startOfWeekKey(focusDay) <= startOfWeekKey(bounds.firstDay);
  const nextWeekDisabled = startOfWeekKey(focusDay) >= startOfWeekKey(bounds.lastDay);
  const prevDayDisabled = focusDay <= bounds.firstDay;
  const nextDayDisabled = focusDay >= bounds.lastDay;
  const periodLabel = weekLayout ? formatWeekRangeLabel(weekStart) : formatCivilDateLong(focusDay);
  const columns = weekLayout
    ? "4.5rem repeat(7, minmax(0, 1fr))"
    : "4.5rem minmax(0, 1fr)";

  function moveWeek(direction: -1 | 1) {
    setFocusDay((current) => {
      const nextWeekStart = addCivilDays(startOfWeekKey(current), direction * 7);
      const firstWeek = startOfWeekKey(bounds.firstDay);
      const lastWeek = startOfWeekKey(bounds.lastDay);
      if (nextWeekStart < firstWeek || nextWeekStart > lastWeek) return current;
      return clampDay(addCivilDays(nextWeekStart, weekdayIndex(current)), bounds.firstDay, bounds.lastDay);
    });
  }

  function moveDay(direction: -1 | 1) {
    setFocusDay((current) => clampDay(addCivilDays(current, direction), bounds.firstDay, bounds.lastDay));
  }

  function goToday() {
    setFocusDay(clampDay(today, bounds.firstDay, bounds.lastDay));
  }

  if (!selected) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="offered-availability-empty">
        No open times
      </p>
    );
  }

  const slotsForDay = (day: string) =>
    visible
      .filter((slot) => slot.dayKey === day)
      .sort((left, right) => left.startMinutes - right.startMinutes || left.lane - right.lane);

  const emptyCopy =
    selected.slots.length === 0
      ? "No open times"
      : weekLayout
        ? "No open times this week."
        : "No open times this day.";

  return (
    <div className="space-y-4">
      <div>
        <p id={tablistId} className="text-sm font-medium">
          Session length
        </p>
        <div role="group" aria-labelledby={tablistId} className="mt-2 flex flex-wrap gap-2">
          {lengths.map((length) => {
            const active = length.durationMinutes === selected.durationMinutes;
            const count = length.slots.length;
            return (
              <button
                key={length.durationMinutes}
                type="button"
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
                onClick={() => setDurationMinutes(length.durationMinutes)}
              >
                <span className="font-semibold">{durationLabel(length.durationMinutes)}</span>
                <span className={cn("ml-2 text-xs", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {count === 0 ? (
                    "No open times"
                  ) : (
                    <>
                      {count} open
                      <span className="sr-only"> {count === 1 ? "time" : "times"}</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section
        aria-label={durationLabel(selected.durationMinutes)}
        data-testid="offered-availability-calendar"
        data-layout={weekLayout ? "week" : "day"}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous week"
              disabled={prevWeekDisabled}
              onClick={() => moveWeek(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next week"
              disabled={nextWeekDisabled}
              onClick={() => moveWeek(1)}
            >
              <ChevronRight />
            </Button>
            {weekLayout ? (
              <p
                data-testid="offered-availability-range"
                aria-live="polite"
                className="px-1 text-sm font-semibold"
              >
                {periodLabel}
              </p>
            ) : null}
          </div>
          <p data-testid="offered-availability-timezone" className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Time zone</span>
            {": "}
            {clientTimezoneCaption(timezone)}
          </p>
        </div>
        {weekLayout ? null : (
          <p
            data-testid="offered-availability-range"
            aria-live="polite"
            className="text-base font-semibold"
          >
            {periodLabel}
          </p>
        )}

        {weekLayout ? null : (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous day"
              disabled={prevDayDisabled}
              onClick={() => moveDay(-1)}
            >
              <ChevronLeft />
            </Button>
            <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
              {weekDays.map((day) => {
                const inBounds = day >= bounds.firstDay && day <= bounds.lastDay;
                const selectedDay = day === focusDay;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={formatCivilDateLong(day)}
                    aria-pressed={selectedDay}
                    aria-current={day === today ? "date" : undefined}
                    disabled={!inBounds}
                    data-testid={`offered-availability-day-${day}`}
                    className={cn(
                      "flex min-w-0 flex-col items-center rounded-lg px-0.5 py-1 text-xs",
                      selectedDay
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted",
                      day === today && !selectedDay && "ring-1 ring-primary",
                      !inBounds && "opacity-40",
                    )}
                    onClick={() => setFocusDay(day)}
                  >
                    <span className="text-[10px] uppercase leading-none tracking-wide" aria-hidden="true">
                      {formatCivil(day, { weekday: "short" })}
                    </span>
                    <span aria-hidden="true" className="text-sm font-semibold">
                      {formatCivil(day, { day: "numeric" })}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next day"
              disabled={nextDayDisabled}
              onClick={() => moveDay(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}

        <p
          className="text-sm text-muted-foreground"
          data-testid={visible.length === 0 ? "offered-availability-empty" : "offered-availability-count"}
        >
          {visible.length === 0 ? emptyCopy : `${openTimesLabel(visible.length)} this ${weekLayout ? "week" : "day"}`}
        </p>

        <div className="overflow-hidden rounded-xl border bg-background">
          <div
            className="grid border-b bg-card"
            style={{ gridTemplateColumns: columns }}
          >
            <div />
            {visibleDays.map((day) => {
              const inOffer = day >= fromKey && day <= toKey;
              const isToday = day === today;
              return (
                <div
                  key={day}
                  aria-current={isToday ? "date" : undefined}
                  data-testid={`offered-availability-column-${day}`}
                  className={cn(
                    "flex flex-col items-center gap-0.5 border-l px-1 py-2 text-center",
                    isToday && "bg-primary/5",
                    !inOffer && "text-muted-foreground",
                  )}
                >
                  <span className="sr-only">{formatCivilDateLong(day)}</span>
                  <span className="font-metadata text-[10px]" aria-hidden="true">
                    {formatCivil(day, { weekday: "short" })}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                      isToday && "bg-primary text-primary-foreground",
                    )}
                  >
                    {formatCivil(day, { day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="relative" style={{ height: gridHeight }} aria-hidden="true">
              {Array.from({ length: (grid.end - grid.start) / 60 + 1 }, (_, index) => {
                const minutes = grid.start + index * 60;
                if (minutes > grid.end) return null;
                const top = ((minutes - grid.start) / 60) * HOUR_HEIGHT_PX;
                return (
                  <span
                    key={minutes}
                    className={cn(
                      "absolute right-2 text-[11px] leading-none text-muted-foreground",
                      minutes === grid.start ? "top-1" : "-translate-y-1/2",
                    )}
                    style={minutes === grid.start ? undefined : { top }}
                  >
                    {formatHourLabel(minutes)}
                  </span>
                );
              })}
            </div>
            {visibleDays.map((day) => {
              const inOffer = day >= fromKey && day <= toKey;
              const isToday = day === today;
              const daySlots = slotsForDay(day);
              return (
                <div
                  key={day}
                  role="list"
                  aria-label={formatCivilDateLong(day)}
                  data-day-column={day}
                  className={cn(
                    "relative border-l",
                    isToday && "bg-primary/5",
                    !inOffer && "bg-muted/40",
                  )}
                  style={{ height: gridHeight }}
                >
                  {Array.from({ length: (grid.end - grid.start) / 30 }, (_, index) => {
                    const minutes = grid.start + index * 30;
                    const hourLine = minutes % 60 === 0;
                    return (
                      <div
                        key={minutes}
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-x-0 border-t",
                          hourLine ? "border-border/80" : "border-border/40",
                        )}
                        style={{ top: ((minutes - grid.start) / 60) * HOUR_HEIGHT_PX }}
                      />
                    );
                  })}
                  {daySlots.map((slot) => {
                    const top = ((slot.startMinutes - grid.start) / 60) * HOUR_HEIGHT_PX + 1;
                    const height = Math.max(
                      ((slot.endMinutes - slot.startMinutes) / 60) * HOUR_HEIGHT_PX - 3,
                      22,
                    );
                    const startLabel = formatBookingSlotTime(slot.iso, timezone);
                    const endLabel = formatBookingSlotTime(
                      new Date(new Date(slot.iso).getTime() + selected.durationMinutes * 60_000),
                      timezone,
                    );
                    return (
                      <div
                        key={slot.iso}
                        role="listitem"
                        data-testid="offered-availability-slot"
                        data-day={slot.dayKey}
                        data-start={slot.iso}
                        data-start-minutes={slot.startMinutes}
                        data-duration={selected.durationMinutes}
                        title={`${formatCivilDateLong(slot.dayKey)}, ${startLabel}–${endLabel}`}
                        aria-label={`${formatCivilDateLong(slot.dayKey)}, ${startLabel} to ${endLabel}, ${durationLabel(selected.durationMinutes)}`}
                        className="absolute overflow-hidden rounded-md border border-[hsl(205_39%_28%/0.22)] border-l-[3px] border-l-primary bg-[hsl(205_46%_91%)] px-1.5 py-0.5 text-foreground"
                        style={{
                          top,
                          height,
                          left: `calc(${(slot.lane / slot.laneCount) * 100}% + 2px)`,
                          width: `calc(${100 / slot.laneCount}% - 4px)`,
                        }}
                      >
                        <p className="truncate text-xs font-semibold leading-4">{startLabel}</p>
                        {height >= 36 ? (
                          <p className="truncate text-[10px] leading-4 text-muted-foreground">{endLabel}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-5 rounded-sm border border-[hsl(205_39%_28%/0.22)] border-l-[3px] border-l-primary bg-[hsl(205_46%_91%)]" aria-hidden="true" />
          Open for clients to book
        </p>
      </section>
    </div>
  );
}
