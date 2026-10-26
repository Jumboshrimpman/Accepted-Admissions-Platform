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

function windowsFor(state: DateHoursState, date: string): DateWindow[] {
  return (state.dateHours[date] ?? []).map((window) => ({ ...window }));
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

function dateOptionLabel(state: DateHoursState, date: string): string {
  const windows = bookableWindowsFor(state, date);
  if (windows.length === 0) return `${formatCivilDate(date)} — Closed`;
  return `${formatCivilDate(date)} — Open, bookable · ${formatWindowList(windows)}`;
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
  const [selectedDate, setSelectedDate] = useState(
    initialPreview?.editorDates[0] ?? initialPreview?.today ?? "",
  );
  const [windows, setWindows] = useState<DateWindow[]>(
    initialPreview
      ? windowsFor(initialPreview, initialPreview.editorDates[0] ?? initialPreview.today)
      : [],
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
    const date = preview.editorDates[0] ?? preview.today;
    setState(preview);
    setSelectedDate(date);
    setWindows(windowsFor(preview, date));
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
        const date = next.editorDates[0] ?? next.today;
        setState(next);
        setSelectedDate(date);
        setWindows(windowsFor(next, date));
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
      setWindows(windowsFor(saved, date));
      setSavedNote(nextWindows.length === 0 ? "This date is now closed." : "Saved.");
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
    setWindows(state ? windowsFor(state, date) : []);
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

  const selectedBookable = bookableWindowsFor(state, selectedDate);
  const selectedClosed = selectedBookable.length === 0;
  const allDatesClosed = state.editorDates.every((date) => bookableWindowsFor(state, date).length === 0);
  const recurring = recurringOf(state);
  const weeklyRows = WEEKDAYS.filter(([id]) => (recurring.days[id]?.length ?? 0) > 0);
  const invalidWindow = windows.some((window) => window.start >= window.end);
  const invalidWeekly = weeklyWindows.some((window) => window.start >= window.end);
  const weeklyOverlap = windowsOverlap(weeklyWindows);
  const weeklyRange =
    recurring.startDate || recurring.endDate
      ? ` Applies ${recurring.startDate ? `from ${formatCivilDate(recurring.startDate)}` : "with no start date"}${recurring.endDate ? ` through ${formatCivilDate(recurring.endDate)}` : " and no end date"}.`
      : " No start or end date, so it applies on dates you have not set.";

  return (
    <Card data-testid="tutor-date-hours-editor" className="border-primary/20 shadow-sm">
      <CardHeader className="px-6 py-5 sm:px-7">
        <CardTitle className="flex items-center gap-2 text-xl">
          <CalendarPlus className="h-5 w-5 text-primary" />
          Set your bookable hours
        </CardTitle>
        <CardDescription className="mt-1 max-w-2xl">
          {readOnly
            ? `Saved hours for the next 8 weeks. This preview cannot change them. Times are ${timezoneCaption(state.timezone)}.`
            : `Pick one date, or set a weekly schedule. A date you save replaces that weekday for that day only, and a closed date stays closed. Times run through midnight ${timezoneCaption(state.timezone)}. Hours you set yourself are offered even when Google Calendar is busy. Bookings, holds, and the shared Meet room still block the time.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-6 pb-6 sm:px-7">
        {allDatesClosed ? (
          <p
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
            role="status"
            data-testid="tutor-date-hours-all-closed"
          >
            All your dates are closed. Students can't book you until you add hours for a date and save it.
          </p>
        ) : null}
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
                {dateOptionLabel(state, date)}
              </option>
            ))}
          </select>
        </label>

        <div
          data-testid="tutor-date-hours-saved"
          className={
            selectedClosed
              ? "rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
              : "rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
          }
        >
          <p className="text-sm font-medium">{selectedClosed ? "CLOSED" : "Open"}</p>
          {selectedClosed ? (
            <p className="mt-1 text-sm font-medium text-destructive">
              This date is closed. Students can't book this date.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium">Open, bookable. Students can book this date.</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {selectedBookable.map((window) => (
                  <li key={`${window.start}-${window.end}`} className="rounded-full border px-3 py-1 text-sm">
                    {formatClock(window.start)}–{formatClock(window.end)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {readOnly ? null : (
        <>
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
            <p className="text-sm text-muted-foreground">No windows yet. This date will stay closed until you add one.</p>
          ) : null}
        </div>

        {invalidWindow ? (
          <p className="text-sm text-destructive" role="alert">
            Each window has to end after it starts.
          </p>
        ) : null}
        {windowsOverlap(windows) ? (
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
            disabled={saving || invalidWindow || windowsOverlap(windows)}
          >
            Save this date
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setWindows([]);
              void save(selectedDate, []);
            }}
            disabled={saving}
          >
            Mark this date closed
          </Button>
        </div>
        </>
        )}

        <div data-testid="tutor-weekly-hours" className="space-y-3 border-t pt-5">
          <div>
            <p className="text-sm font-medium">Weekly schedule</p>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="tutor-weekly-hours-status">
              {weeklyRows.length === 0
                ? "No weekly schedule is active. Students can't book you from a weekly schedule until you add hours and save them."
                : `Saved weekdays are bookable on dates you have not closed.${weeklyRange}`}
            </p>
          </div>
          {weeklyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No weekly schedule saved.</p>
          ) : (
            <ul className="space-y-2 text-sm text-muted-foreground" data-testid="tutor-weekly-hours-saved">
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

        <div data-testid="tutor-date-hours-other-dates">
          <p className="text-sm font-medium">Next 8 weeks</p>
          <ul className="mt-2 space-y-2 text-sm">
            {state.editorDates.map((date) => {
              const windows = bookableWindowsFor(state, date);
              const closed = windows.length === 0;
              return (
                <li
                  key={date}
                  className="flex flex-wrap items-center gap-2"
                  data-testid={`tutor-date-hours-day-${date}`}
                >
                  <span className={closed ? "font-medium text-destructive" : "font-medium"}>
                    {formatCivilDate(date)}
                    {closed ? " — Closed" : ` — Open, bookable: ${formatWindowList(windows)}`}
                  </span>
                  {readOnly || closed ? null : (
                    <>
                      <Button type="button" variant="outline" onClick={() => chooseDate(date)}>
                        Edit {formatCivilDate(date)}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => save(date, [])}
                        disabled={saving}
                      >
                        Delete {formatCivilDate(date)}
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function timeChoices(current: string, options: string[]): string[] {
  if (options.includes(current)) return options;
  return [...options, current].sort();
}
