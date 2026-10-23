import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DateWindow = { start: string; end: string };

export type DateHoursState = {
  tutorProfileId: string;
  timezone: string;
  dateHours: Record<string, DateWindow[]>;
  today: string;
  latestDate: string;
  editorDates: string[];
};

const TIME_OPTIONS = buildTimeOptions("06:00", "22:00");

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
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteText} ${suffix}`;
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

  const savedWindows = state.dateHours[selectedDate] ?? [];
  const otherOpenDates = state.editorDates.filter(
    (date) => date !== selectedDate && (state.dateHours[date]?.length ?? 0) > 0,
  );
  const invalidWindow = windows.some((window) => window.start >= window.end);

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
            : `Pick a date in the next 8 weeks. Add the hours clients can book, or mark the date closed. Save this date before you pick another one. Saving one date leaves every other date as it is. Times are ${timezoneCaption(state.timezone)}. Sessions already on the calendar stay booked.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-6 pb-6 sm:px-7">
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

        <div data-testid="tutor-date-hours-saved">
          <p className="text-sm font-medium">Currently saved</p>
          {savedWindows.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">This date is closed.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-2">
              {savedWindows.map((window) => (
                <li key={`${window.start}-${window.end}`} className="rounded-full border px-3 py-1 text-sm">
                  {formatClock(window.start)}–{formatClock(window.end)}
                </li>
              ))}
            </ul>
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
                  {timeChoices(window.start).map((time) => (
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
                  {timeChoices(window.end).map((time) => (
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
            disabled={saving || invalidWindow}
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

        <div data-testid="tutor-date-hours-other-dates">
          <p className="text-sm font-medium">Other open dates</p>
          {otherOpenDates.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No other open dates in the next 8 weeks.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {otherOpenDates.map((date) => (
                <li key={date}>
                  {formatCivilDate(date)}
                  {": "}
                  {(state.dateHours[date] ?? [])
                    .map((window) => `${formatClock(window.start)}–${formatClock(window.end)}`)
                    .join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function timeChoices(current: string): string[] {
  if (TIME_OPTIONS.includes(current)) return TIME_OPTIONS;
  return [...TIME_OPTIONS, current].sort();
}
