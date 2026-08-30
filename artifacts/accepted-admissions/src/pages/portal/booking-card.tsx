import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Link2,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  getGetBookingAvailabilityQueryKey,
  getListBookingSessionsQueryKey,
  useCancelBookingSession,
  useCreateBookingSession,
  useGetBookingAvailability,
  useListBookingSessions,
  useListBookingTutors,
  useRescheduleBookingSession,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type CreditResponse = { remainingHours: number };

function apiPath(path: string): string {
  return `${basePath}${path}`;
}

function errorMessage(error: unknown): string {
  const data = (error as { data?: { error?: string } } | null)?.data;
  return data?.error ?? "The booking could not be completed. Please try again.";
}

export function BookingCard() {
  const queryClient = useQueryClient();
  const [selectedTutorId, setSelectedTutorId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [reschedulingSessionId, setReschedulingSessionId] = useState<string | null>(null);
  const [remainingHours, setRemainingHours] = useState<number | null>(null);
  const [creditError, setCreditError] = useState("");
  const [message, setMessage] = useState("");

  const tutorsQuery = useListBookingTutors();
  const sessionsQuery = useListBookingSessions();
  const tutors = tutorsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const selectedTutor = tutors.find((tutor) => tutor.id === selectedTutorId);
  const activeSession = sessions.find((session) => session.id === reschedulingSessionId);
  const durationMinutes = activeSession?.durationMinutes ?? 60;
  const range = useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);
  const availabilityQuery = useGetBookingAvailability(
    {
      tutorProfileId: selectedTutorId,
      from: range.from,
      to: range.to,
      durationMinutes,
    },
    {
      query: {
        enabled: Boolean(selectedTutorId),
        staleTime: 30_000,
        queryKey: getGetBookingAvailabilityQueryKey({
          tutorProfileId: selectedTutorId,
          from: range.from,
          to: range.to,
          durationMinutes,
        }),
      },
    },
  );
  const createBooking = useCreateBookingSession();
  const cancelBooking = useCancelBookingSession();
  const rescheduleBooking = useRescheduleBookingSession();

  const refreshCredits = () => {
    fetch(apiPath("/api/credits"))
      .then((response) => {
        if (!response.ok) throw new Error("Credits unavailable");
        return response.json() as Promise<CreditResponse>;
      })
      .then((data) => {
        setRemainingHours(data.remainingHours);
        setCreditError("");
      })
      .catch(() => setCreditError("Credit balance is temporarily unavailable."));
  };

  useEffect(() => {
    refreshCredits();
  }, []);

  const invalidateBookingData = () => {
    queryClient.invalidateQueries({ queryKey: getListBookingSessionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBookingAvailabilityQueryKey() });
    refreshCredits();
  };

  const chooseTutor = (tutorId: string) => {
    setSelectedTutorId(tutorId);
    setSelectedSlot("");
    setMessage("");
  };

  const beginReschedule = (sessionId: string, tutorId: string | null) => {
    if (!tutorId) return;
    setReschedulingSessionId(sessionId);
    chooseTutor(tutorId);
    setMessage("Choose a new time. Your prepaid hour stays reserved while you reschedule.");
  };

  const submitBooking = () => {
    if (!selectedSlot) return;
    setMessage("");
    if (reschedulingSessionId) {
      rescheduleBooking.mutate(
        { sessionId: reschedulingSessionId, data: { startTime: selectedSlot } },
        {
          onSuccess: () => {
            invalidateBookingData();
            setReschedulingSessionId(null);
            setSelectedSlot("");
            setMessage("Your session was rescheduled.");
          },
          onError: (error) => setMessage(errorMessage(error)),
        },
      );
      return;
    }
    createBooking.mutate(
      { data: { tutorProfileId: selectedTutorId, startTime: selectedSlot, durationMinutes: 60 } },
      {
        onSuccess: () => {
          invalidateBookingData();
          setSelectedSlot("");
          setMessage("Your prepaid hour is reserved. The calendar invitation is on its way.");
        },
        onError: (error) => setMessage(errorMessage(error)),
      },
    );
  };

  const cancel = (sessionId: string) => {
    cancelBooking.mutate(
      { sessionId, data: { reason: "Cancelled by student" } },
      {
        onSuccess: () => {
          invalidateBookingData();
          setMessage("Your credit was restored and the session was cancelled.");
        },
        onError: (error) => setMessage(errorMessage(error)),
      },
    );
  };

  const busy = createBooking.isPending || cancelBooking.isPending || rescheduleBooking.isPending;
  const availableSlots = availabilityQuery.data?.slots ?? [];

  return (
    <Card className="border-primary/15 shadow-lg shadow-primary/5">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CalendarClock className="h-5 w-5 text-primary" />
              Reserve a prepaid SAT hour
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              Pick an eligible tutor and a time verified against their availability and Google Calendar.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            {remainingHours === null ? "Checking balance…" : `${remainingHours} prepaid hour${remainingHours === 1 ? "" : "s"}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {creditError && <p className="text-sm text-muted-foreground">{creditError}</p>}
        {tutorsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading eligible tutors…</p>
        ) : tutors.length === 0 ? (
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No SAT tutors are currently eligible for prepaid-hour booking.
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {tutors.map((tutor) => (
                <button
                  key={tutor.id}
                  type="button"
                  onClick={() => chooseTutor(tutor.id)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    selectedTutorId === tutor.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{tutor.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{tutor.title}</p>
                    </div>
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${tutor.providerStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {tutor.providerStatus === "connected"
                      ? "Calendar connected"
                      : "Calendar connection needed"}
                  </p>
                </button>
              ))}
            </div>

            {selectedTutor && (
              <div className="rounded-2xl bg-muted/40 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">
                      {reschedulingSessionId ? "Choose a new time" : `Available times with ${selectedTutor.name}`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Showing the next 14 days in {availabilityQuery.data?.tutor.timezone ?? "the tutor’s timezone"}.
                    </p>
                  </div>
                  {availabilityQuery.data?.providerStatus === "disconnected" && (
                    <span className="text-xs font-medium text-amber-700">Calendar disconnected</span>
                  )}
                </div>
                {availabilityQuery.isLoading ? (
                  <p className="mt-4 text-sm text-muted-foreground">Checking live availability…</p>
                ) : availabilityQuery.data?.providerStatus === "disconnected" ? (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>This tutor needs to reconnect Google Calendar before times can be displayed.</span>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">No times are open in this window. Try another tutor.</p>
                ) : (
                  <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`rounded-xl border px-3 py-3 text-left text-sm ${
                          selectedSlot === slot
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background hover:border-primary/50"
                        }`}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <Clock3 className="h-4 w-4" />
                          {format(parseISO(slot), "EEE, MMM d")}
                        </span>
                        <span className="mt-1 block pl-6 text-xs opacity-80">{format(parseISO(slot), "h:mm a")}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedSlot && (
                  <Button className="mt-4 rounded-full" onClick={submitBooking} disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {reschedulingSessionId ? "Confirm new time" : "Reserve this hour"}
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {message && <p className="rounded-xl bg-primary/5 p-3 text-sm text-foreground" role="status">{message}</p>}

        <div className="border-t pt-5">
          <h3 className="font-semibold">Your booked sessions</h3>
          {sessionsQuery.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading sessions…</p>
          ) : sessions.filter((session) => session.bookingStatus !== "cancelled").length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No prepaid sessions reserved yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {sessions
                .filter((session) => session.bookingStatus !== "cancelled")
                .map((session) => (
                  <div key={session.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{session.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {format(parseISO(session.dateTime), "EEE, MMM d · h:mm a")} · {session.timezone}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {session.bookingStatus === "rescheduled" ? "Rescheduled" : "Confirmed"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => beginReschedule(session.id, session.tutorProfileId)}
                        disabled={busy}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Change time
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-destructive hover:text-destructive"
                        onClick={() => cancel(session.id)}
                        disabled={busy}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancel
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
          {sessions.some((session) => session.bookingStatus === "cancelled") && (
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Cancelled sessions restore their prepaid credit.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}