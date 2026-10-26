import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DateWindow = { start: string; end: string };
type RecurringHours = {
  startDate: string | null;
  endDate: string | null;
  days: Record<string, DateWindow[]>;
};

export type DateHoursState = {
  tutorProfileId: string;
  timezone: string;
  dateHours: Record<string, DateWindow[]>;
  recurringHours?: RecurringHours;
  today: string;
  latestDate: string;
  editorDates: string[];
};

const START_OPTIONS = buildTimeOptions("06:00", "23:45");
const END_OPTIONS = buildTimeOptions("06:15", "24:00");
const WEEKDAYS = [
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
  ["0", "Sunday"],
] as const;

const EMPTY_RECURRING: RecurringHours = { startDate: null, endDate: null, days: {} };

function buildTimeOptions(start: string, end: string): string[] {
  const options: string[] = [];
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  let cursor = (startHour ?? 0) * 60 + (startMinute ?? 0);
  const last = (endHour ?? 0) * 60 + (endMinute ?? 0);
  while (cursor <= last) {
    options.push(
      `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`,
    );
    cursor += 15;
  }
  return options;
}

function formatClock(value: string): string {
  if (value === "24:00") return "12:00 AM";
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteText} ${suffix}`;
}

function clockMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function windowsOverlap(windows: DateWindow[]): boolean {
  const spans = windows
    .map((window) => ({ start: clockMinutes(window.start), end: clockMinutes(window.end) }))
    .sort((left, right) => left.start - right.start);
  return spans.some((span, index) => index > 0 && span.start < spans[index - 1]!.end);
}

function recurringOf(state: DateHoursState | null): RecurringHours {
  return state?.recurringHours ?? EMPTY_RECURRING;
}

function formatCivilDate(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
}

function timezoneCaption(timezone: string): string {
  if (timezone === "America/New_York") return "Eastern Time";
  return timezone;
}

function copyWindows(windows: DateWindow[]): DateWindow[] {
  return windows.map((window) => ({ ...window }));
}

function weekdayKey(date: string): string {
  return String(new Date(`${date}T00:00:00.000Z`).getUTCDay());
}

/** An explicit date, including an empty closure, wins. Otherwise the weekly schedule can open it. */
function bookableWindowsFor(state: DateHoursState, date: string): DateWindow[] {
  if (Object.prototype.hasOwnProperty.call(state.dateHours, date)) {
    return (state.dateHours[date] ?? []).map((window) => ({ ...window }));
  }
  const recurring = recurringOf(state);
  if (recurring.startDate && date < recurring.startDate) return [];
  if (recurring.endDate && date > recurring.endDate) return [];
  return (recurring.days[weekdayKey(date)] ?? []).map((window) => ({ ...window }));
}

function formatWindowList(windows: DateWindow[]): string {
  return windows.map((window) => `${formatClock(window.start)}–${formatClock(window.end)}`).join(", ");
}

/** Next open date, otherwise the next date in the editor. Never prefers a closed day when an open one exists. */
function preferredDate(state: DateHoursState): string {
  const upcoming = state.editorDates.filter((date) => date >= state.today);
  const pool = upcoming.length > 0 ? upcoming : state.editorDates;
  const open = pool.find((date) => bookableWindowsFor(state, date).length > 0);
  return open ?? pool[0] ?? state.today;
}

function errorMessage(error: unknown, fallback: string): string {
  const detail = (error as { data?: { error?: string } } | null)?.data?.error;
  return detail || fallback;
}

export function TutorDateHoursEditor({
  preview,
}: {
  /** Administrator preview. Null hides the card. Omit this prop on the live dashboard. */
  preview?: DateHoursState | null;
} = {}) {
  const readOnly = preview !== undefined;
  const initialPreview = preview ?? null;
  const [state, setState] = useState<DateHoursState | null>(initialPreview);
  const [hidden, setHidden] = useState(readOnly && !initialPreview);
  const [loaded, setLoaded] = useState(readOnly);
  const [loadError, setLoadError] = useState("");
  const initialDate = initialPreview ? preferredDate(initialPreview) : "";
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [windows, setWindows] = useState<DateWindow[]>(
    initialPreview ? copyWindows(bookableWindowsFor(initialPreview, initialDate)) : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [weeklyDay, setWeeklyDay] = useState("1");
  const [weeklyWindows, setWeeklyWindows] = useState<DateWindow[]>([]);
  const [weeklyStart, setWeeklyStart] = useState(recurringOf(initialPreview).startDate ?? "");
  const [weeklyEnd, setWeeklyEnd] = useState(recurringOf(initialPreview).endDate ?? "");
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [weeklyError, setWeeklyError] = useState("");
  const [weeklyNote, setWeeklyNote] = useState("");

  useEffect(() => {
    if (!readOnly) return;
    if (!preview) {
      setHidden(true);
      setLoaded(true);
      return;
    }
    const date = preferredDate(preview);
    setState(preview);
    setSelectedDate(date);
    setWindows(copyWindows(bookableWindowsFor(preview, date)));
    setWeeklyStart(recurringOf(preview).startDate ?? "");
    setWeeklyEnd(recurringOf(preview).endDate ?? "");
    setHidden(false);
    setLoaded(true);
  }, [preview, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await customFetch<DateHoursState>("/api/tutor/date-hours");
        if (cancelled) return;
        const date = preferredDate(next);
        setState(next);
        setSelectedDate(date);
        setWindows(copyWindows(bookableWindowsFor(next, date)));
        setWeeklyStart(recurringOf(next).startDate ?? "");
        setWeeklyEnd(recurringOf(next).endDate ?? "");
      } catch (loadFailure) {
        const status = (loadFailure as { status?: number } | null)?.status;
        if (status === 403) {
          if (!cancelled) setHidden(true);
          return;
        }
        if (!cancelled) {
          setLoadError(
            status === 404
              ? "Booking hours are not set up yet."
              : "Booking hours could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readOnly]);

  if (!loaded || hidden) return null;

  async function save(date: string, nextWindows: DateWindow[]) {
    setSaving(true);
    setError("");
    setSavedNote("");
    try {
      const saved = await customFetch<DateHoursState>("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({ dateHours: { [date]: nextWindows } }),
      });
      setState(saved);
      setWindows(copyWindows(bookableWindowsFor(saved, date)));
      setSelectedDate(date);
      setSavedNote("Saved.");
    } catch (saveFailure) {
      setError(errorMessage(saveFailure, "Could not save this date."));
    } finally {
      setSaving(false);
    }
  }

  async function saveWeekly(next: RecurringHours) {
    setWeeklySaving(true);
    setWeeklyError("");
    setWeeklyNote("");
    try {
      const saved = await customFetch<DateHoursState>("/api/tutor/date-hours", {
        method: "PUT",
        body: JSON.stringify({ recurringHours: next }),
      });
      setState(saved);
      const recurring = recurringOf(saved);
      setWeeklyStart(recurring.startDate ?? "");
      setWeeklyEnd(recurring.endDate ?? "");
      setWeeklyNote("Weekly hours saved.");
    } catch (saveFailure) {
      setWeeklyError(errorMessage(saveFailure, "Could not save weekly hours."));
    } finally {
      setWeeklySaving(false);
    }
  }

  function weeklyPayload(day: string, dayWindows: DateWindow[]): RecurringHours {
    const days = { ...recurringOf(state).days };
    if (dayWindows.length === 0) delete days[day];
    else days[day] = dayWindows.map((window) => ({ ...window }));
    return {
      startDate: weeklyStart.trim() === "" ? null : weeklyStart,
      endDate: weeklyEnd.trim() === "" ? null : weeklyEnd,
      days,
    };
  }

  function chooseDate(date: string) {
    setSelectedDate(date);
    setWindows(state ? copyWindows(bookableWindowsFor(state, date)) : []);
    setError("");
    setSavedNote("");
  }

  if (!state) {
    return (
      <Card data-testid="tutor-date-hours-editor" className="border-primary/20 shadow-sm">
        <CardHeader className="px-6 py-5 sm:px-7">
          <CardTitle className="text-xl">Set your bookable hours</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6 sm:px-7">
          <p className="text-sm text-destructive" role="alert">
            {loadError || "Booking hours could not be loaded."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const openRows = state.editorDates.flatMap((date) => {
    const bookable = bookableWindowsFor(state, date);
    if (bookable.length === 0) return [];
    return [{ date, bookable }];
  });
  const openDateCount = openRows.length;
  const recurring = recurringOf(state);
  const weeklyRows = WEEKDAYS.filter(([id]) => (recurring.days[id]?.length ?? 0) > 0);
  const invalidWindow = windows.some((window) => window.start >= window.end);
  const invalidWeekly = weeklyWindows.some((window) => window.start >= window.end);
  const dateOverlap = windowsOverlap(windows);
  const weeklyOverlap = windowsOverlap(weeklyWindows);
  const weeklyRange =
    recurring.startDate || recurring.endDate
      ? ` ${recurring.startDate ? `From ${formatCivilDate(recurring.startDate)}` : "From any date"}${recurring.endDate ? ` through ${formatCivilDate(recurring.endDate)}` : ""}.`
      : "";

  return (
    <Card data-testid="tutor-date-hours-editor" className="border-primary/20 shadow-sm">
      <CardHeader className="px-6 py-5 sm:px-7">
        <CardTitle className="flex items-center gap-2 text-xl">
          <CalendarPlus className="h-5 w-5 text-primary" />
          Set your bookable hours
        </CardTitle>
        <CardDescription className="mt-1">
          Times are {timezoneCaption(state.timezone)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-6 pb-6 sm:px-7">
        <p className="text-sm font-medium" role="status" data-testid="tutor-date-hours-status">
          {openDateCount === 0
            ? "No open hours yet. Students can't book you until you add some."
            : `Students can book you on ${openDateCount} ${openDateCount === 1 ? "date" : "dates"}.`}
        </p>

        {openDateCount > 0 ? (
          <div data-testid="tutor-date-hours-open-dates">
            <h2 className="text-sm font-medium">Open dates</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {openRows.map((row) => (
                <li
                  key={row.date}
                  className="flex flex-wrap items-center gap-2"
                  data-testid={`tutor-date-hours-day-${row.date}`}
                >
                  <span className="font-medium">
                    {formatCivilDate(row.date)}
                    {" · "}
                    {formatWindowList(row.bookable)}
                  </span>
                  {readOnly ? null : (
                    <>
                      <Button type="button" variant="outline" size="sm" onClick={() => chooseDate(row.date)}>
                        Edit {formatCivilDate(row.date)}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => save(row.date, [])}
                        disabled={saving}
                      >
                        Remove {formatCivilDate(row.date)}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {readOnly ? null : (
          <div className="space-y-3" data-testid="tutor-date-hours-add">
            <h2 className="text-sm font-medium">Add hours</h2>
            <label className="block text-sm font-medium" htmlFor="tutor-date-hours-date">
              Date
              <select
                id="tutor-date-hours-date"
                className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedDate}
                onChange={(event) => chooseDate(event.target.value)}
              >
                {state.editorDates.map((date) => (
                  <option key={date} value={date}>
                    {formatCivilDate(date)}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-3" data-testid="tutor-date-hours-windows">
              {windows.map((window, index) => (
                <div key={`${selectedDate}-${index}`} className="flex flex-wrap items-end gap-2">
                  <label className="text-sm font-medium">
                    Start
                    <select
                      aria-label={`Start time ${index + 1}`}
                      className="mt-1 h-10 rounded-md border bg-background px-3 text-sm"
                      value={window.start}
                      onChange={(event) => {
                        const start = event.target.value;
                        setWindows((current) =>
                          current.map((item, itemIndex) => (itemIndex === index ? { ...item, start } : item)),
                        );
                      }}
                    >
                      {timeChoices(window.start, START_OPTIONS).map((time) => (
                        <option key={time} value={time}>
                          {formatClock(time)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    End
                    <select
                      aria-label={`End time ${index + 1}`}
                      className="mt-1 h-10 rounded-md border bg-background px-3 text-sm"
                      value={window.end}
                      onChange={(event) => {
                        const end = event.target.value;
                        setWindows((current) =>
                          current.map((item, itemIndex) => (itemIndex === index ? { ...item, end } : item)),
                        );
                      }}
                    >
                      {timeChoices(window.end, END_OPTIONS).map((time) => (
                        <option key={time} value={time}>
                          {formatClock(time)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWindows((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Remove window {index + 1}
                  </Button>
                </div>
              ))}
              {windows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Choose a start and end, then save.</p>
              ) : null}
            </div>

            {invalidWindow ? (
              <p className="text-sm text-destructive" role="alert">
                Each window has to end after it starts.
              </p>
            ) : null}
            {dateOverlap ? (
              <p className="text-sm text-destructive" role="alert" data-testid="tutor-date-hours-overlap">
                These windows overlap. Adjust them before saving.
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {savedNote ? <p className="text-sm text-muted-foreground">{savedNote}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWindows((current) => [...current, { start: "16:00", end: "17:00" }])}
              >
                Add a window
              </Button>
              <Button
                type="button"
                onClick={() => save(selectedDate, windows)}
                disabled={saving || windows.length === 0 || invalidWindow || dateOverlap}
              >
                Save hours
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => save(selectedDate, [])}
                disabled={saving}
              >
                Remove hours
              </Button>
            </div>
          </div>
        )}

        <div data-testid="tutor-weekly-hours" className="space-y-3 border-t pt-5">
          <div>
            <h2 className="text-sm font-medium">Repeat weekly</h2>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="tutor-weekly-hours-status">
              {weeklyRows.length === 0
                ? "No weekly schedule saved."
                : `Repeats on dates you have not set yourself.${weeklyRange}`}
            </p>
          </div>
          {weeklyRows.length === 0 ? null : (
            <ul className="space-y-2 text-sm" data-testid="tutor-weekly-hours-saved">
              {weeklyRows.map(([id, label]) => (
                <li key={id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {label}
                    {": "}
                    {(recurring.days[id] ?? [])
                      .map((window) => `${formatClock(window.start)}–${formatClock(window.end)}`)
                      .join(", ")}
                  </span>
                  {readOnly ? null : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setWeeklyDay(id);
                          setWeeklyWindows((recurring.days[id] ?? []).map((window) => ({ ...window })));
                          setWeeklyStart(recurring.startDate ?? "");
                          setWeeklyEnd(recurring.endDate ?? "");
                          setWeeklyError("");
                          setWeeklyNote("");
                        }}
                      >
                        Edit {label}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const days = { ...recurring.days };
                          delete days[id];
                          void saveWeekly({
                            startDate: recurring.startDate,
                            endDate: recurring.endDate,
                            days,
                          });
                        }}
                        disabled={weeklySaving}
                      >
                        Delete {label}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {readOnly ? null : (
            <div className="space-y-3" data-testid="tutor-weekly-hours-form">
              <label className="block text-sm font-medium" htmlFor="tutor-weekly-day">
                Weekday
                <select
                  id="tutor-weekly-day"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={weeklyDay}
                  onChange={(event) => setWeeklyDay(event.target.value)}
                >
                  {WEEKDAYS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-3">
                <label className="text-sm font-medium" htmlFor="tutor-weekly-start">
                  Optional start date
                  <input
                    id="tutor-weekly-start"
                    type="date"
                    className="mt-1 h-10 rounded-md border bg-background px-3 text-sm"
                    value={weeklyStart}
                    onChange={(event) => setWeeklyStart(event.target.value)}
                  />
                </label>
                <label className="text-sm font-medium" htmlFor="tutor-weekly-end">
                  Optional end date
                  <input
                    id="tutor-weekly-end"
                    type="date"
                    className="mt-1 h-10 rounded-md border bg-background px-3 text-sm"
                    value={weeklyEnd}
                    onChange={(event) => setWeeklyEnd(event.target.value)}
                  />
                </label>
              </div>
              {weeklyWindows.map((window, index) => (
                <div key={`weekly-${index}`} className="flex flex-wrap items-end gap-2">
                  <label className="text-sm font-medium">
                    Start
                    <select
                      aria-label={`Weekly start time ${index + 1}`}
                      className="mt-1 h-10 rounded-md border bg-background px-3 text-sm"
                      value={window.start}
                      onChange={(event) => {
                        const start = event.target.value;
                        setWeeklyWindows((current) =>
                          current.map((item, itemIndex) => (itemIndex === index ? { ...item, start } : item)),
                        );
                      }}
                    >
                      {timeChoices(window.start, START_OPTIONS).map((time) => (
                        <option key={time} value={time}>
                          {formatClock(time)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    End
                    <select
                      aria-label={`Weekly end time ${index + 1}`}
                      className="mt-1 h-10 rounded-md border bg-background px-3 text-sm"
                      value={window.end}
                      onChange={(event) => {
                        const end = event.target.value;
                        setWeeklyWindows((current) =>
                          current.map((item, itemIndex) => (itemIndex === index ? { ...item, end } : item)),
                        );
                      }}
                    >
                      {timeChoices(window.end, END_OPTIONS).map((time) => (
                        <option key={time} value={time}>
                          {formatClock(time)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setWeeklyWindows((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    Remove weekly window {index + 1}
                  </Button>
                </div>
              ))}
              {invalidWeekly ? (
                <p className="text-sm text-destructive" role="alert">
                  Each weekly window has to end after it starts.
                </p>
              ) : null}
              {weeklyOverlap ? (
                <p className="text-sm text-destructive" role="alert" data-testid="tutor-weekly-hours-overlap">
                  These windows overlap. Adjust them before saving.
                </p>
              ) : null}
              {weeklyError ? (
                <p className="text-sm text-destructive" role="alert">
                  {weeklyError}
                </p>
              ) : null}
              {weeklyNote ? <p className="text-sm text-muted-foreground">{weeklyNote}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setWeeklyWindows((current) => [...current, { start: "21:00", end: "22:00" }])
                  }
                >
                  Add a weekly window
                </Button>
                <Button
                  type="button"
                  onClick={() => saveWeekly(weeklyPayload(weeklyDay, weeklyWindows))}
                  disabled={weeklySaving || weeklyWindows.length === 0 || invalidWeekly || weeklyOverlap}
                >
                  Save weekly hours
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function timeChoices(current: string, options: string[]): string[] {
  if (options.includes(current)) return options;
  return [...options, current].sort();
}
