import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarConnectUrl } from "@/pages/portal/calendar-connection-card";
import {
  bookingSlotDayKey,
  clientTimezoneCaption,
  formatBookingSlotTime,
  formatSessionDate,
} from "@/lib/session-display";

type OfferedLength = {
  durationMinutes: number;
  slots: string[];
};

export type OfferedAvailability = {
  from: string;
  to: string;
  timezone: string;
  providerStatus: "connected" | "disconnected" | "reconnect";
  offeredToClients?: boolean;
  availabilityDependsOnClient?: boolean;
  usesAdminCalendarFallback?: boolean;
  lengths: OfferedLength[];
};

function durationLabel(minutes: number): string {
  if (minutes === 60) return "1 hour";
  if (minutes === 90) return "1.5 hours";
  if (minutes === 120) return "2 hours";
  return `${minutes} minutes`;
}

function slotsByDay(slots: string[], timezone: string): Array<{ dayKey: string; slots: string[] }> {
  const groups = new Map<string, string[]>();
  for (const slot of slots) {
    const dayKey = bookingSlotDayKey(slot, timezone);
    const current = groups.get(dayKey);
    if (current) current.push(slot);
    else groups.set(dayKey, [slot]);
  }
  return [...groups.entries()].map(([dayKey, daySlots]) => ({ dayKey, slots: daySlots }));
}

export function TutorOfferedAvailability({
  preview,
  googleBusyTimesOmitted = false,
}: {
  /** Administrator preview. Null hides the card. Omit this prop on the live dashboard. */
  preview?: OfferedAvailability | null;
  googleBusyTimesOmitted?: boolean;
} = {}) {
  const readOnly = preview !== undefined;
  void googleBusyTimesOmitted;
  const [offer, setOffer] = useState<OfferedAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!readOnly) return;
    if (!preview) {
      setHidden(true);
      setLoading(false);
      return;
    }
    setOffer(preview);
    setHidden(false);
    setLoading(false);
  }, [preview, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await customFetch<OfferedAvailability>("/api/tutor/offered-availability");
        if (!cancelled) setOffer(next);
      } catch (loadError) {
        const status = (loadError as { status?: number } | null)?.status;
        if (status === 404) {
          if (!cancelled) setHidden(true);
          return;
        }
        if (!cancelled) setError("Offered availability could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readOnly]);

  if (hidden) return null;

  const timezone = offer?.timezone ?? "";
  const notOffered = offer?.offeredToClients === false;
  const reconnect = offer?.providerStatus === "reconnect";
  const openSlotCount =
    offer?.lengths.reduce((count, length) => count + length.slots.length, 0) ?? 0;
  const disconnectedWithoutSlots =
    offer?.providerStatus === "disconnected" && openSlotCount === 0 && !notOffered;
  const showSlots = Boolean(offer) && !notOffered && !reconnect && !disconnectedWithoutSlots;
  const clientSpecific = offer?.availabilityDependsOnClient === true && !notOffered;

  return (
    <Card data-testid="tutor-offered-availability" className="border-primary/20 shadow-sm">
      <CardHeader className="px-6 py-5 sm:px-7">
        <CardTitle className="flex items-center gap-2 text-xl">
          <CalendarClock className="h-5 w-5 text-primary" />
          Availability offered to clients
        </CardTitle>
        <CardDescription className="mt-1 max-w-2xl">
          {reconnect
            ? "Google Calendar needs to be reconnected before clients can book you."
            : "Times students can book over the next 14 days."}
          {timezone ? ` Times are shown in ${clientTimezoneCaption(timezone)}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6 sm:px-7">
        {loading ? <p className="text-sm text-muted-foreground">Loading the times clients can book.</p> : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {notOffered ? (
          <div className="rounded-xl border border-dashed p-4 text-sm" data-testid="tutor-offered-not-listed">
            <p className="font-medium">You are not currently offered for booking.</p>
            <p className="mt-1 text-muted-foreground">Clients do not see open times for you.</p>
          </div>
        ) : null}
        {clientSpecific ? (
          <p className="mb-4 text-sm text-muted-foreground" data-testid="tutor-offered-client-specific">
            Only approved clients can book you; those clients see these times.
          </p>
        ) : null}
        {reconnect && !notOffered ? (
          <div className="rounded-xl border border-dashed p-4 text-sm" data-testid="tutor-offered-reconnect">
            <p className="font-medium">Reconnect Google Calendar to offer bookable times.</p>
            <p className="mt-1 text-muted-foreground">
              The sessions calendar is missing, so a booking would be refused. No times are shown until
              you reconnect.
            </p>
            {readOnly ? null : (
            <a
              className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              href={calendarConnectUrl("tutor_dashboard")}
            >
              Reconnect Google Calendar
            </a>
            )}
          </div>
        ) : null}
        {disconnectedWithoutSlots ? (
          <div className="rounded-xl border border-dashed p-4 text-sm" data-testid="tutor-offered-disconnected">
            <p className="font-medium">Clients cannot book you until Google Calendar is connected.</p>
            <p className="mt-1 text-muted-foreground">
              No times are being offered until the calendar connection is in place.
            </p>
            {readOnly ? null : (
            <a
              className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
              href={calendarConnectUrl("tutor_dashboard")}
            >
              Connect Google Calendar
            </a>
            )}
          </div>
        ) : null}
        {showSlots && offer ? (
          <div className="max-h-96 space-y-6 overflow-y-auto">
            {offer.lengths.map((length) => {
              const days = slotsByDay(length.slots, offer.timezone);
              return (
                <section key={length.durationMinutes} aria-label={durationLabel(length.durationMinutes)}>
                  <h3 className="text-sm font-semibold">
                    {durationLabel(length.durationMinutes)}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {length.slots.length === 0
                        ? "No open times"
                        : `${length.slots.length} open ${length.slots.length === 1 ? "time" : "times"}`}
                    </span>
                  </h3>
                  {days.length > 0 ? (
                    <ul className="mt-2 space-y-3">
                      {days.map((day) => (
                        <li key={day.dayKey}>
                          <p className="text-sm text-muted-foreground">
                            {formatSessionDate({ dateTime: day.slots[0]!, timezone: offer.timezone })}
                          </p>
                          <ul className="mt-1 flex flex-wrap gap-2">
                            {day.slots.map((slot) => (
                              <li
                                key={slot}
                                className="rounded-full border px-3 py-1 text-sm"
                              >
                                {formatBookingSlotTime(slot, offer.timezone)}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
