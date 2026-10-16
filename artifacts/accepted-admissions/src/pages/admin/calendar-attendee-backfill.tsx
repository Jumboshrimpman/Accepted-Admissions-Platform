import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type CalendarAttendeeBackfillEvent = {
  sessionId: string;
  title?: string | null;
  start?: string | null;
  tutorUserId?: string | null;
  studentName?: string | null;
  tutorName?: string | null;
  sessionType?: string | null;
  eventId?: string | null;
  reason?: string;
};

export type CalendarAttendeeBackfillReport = {
  dryRun: boolean;
  missing: CalendarAttendeeBackfillEvent[];
  refused: CalendarAttendeeBackfillEvent[];
  alreadyPresent: number;
  alreadyPresentSessions?: CalendarAttendeeBackfillEvent[];
  skipped: CalendarAttendeeBackfillEvent[];
  patched: string[];
};

export type CalendarAttendeeOutcomeRow = CalendarAttendeeBackfillEvent & {
  outcome: "Added" | "Refused" | "Already present" | "Skipped";
  detail: string;
};

const BACKFILL_PATH = "/api/admin/calendar-attendees/backfill";

export function formatBackfillStart(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function backfillReasonLabel(reason: string | undefined): string {
  if (reason === "starts_within_60_minutes") return "Starts within 60 minutes";
  if (reason === "calendar_read_failed") return "Calendar could not be read";
  if (reason === "event_unreadable") return "Event could not be read";
  if (reason === "patch_failed") return "Could not update the event";
  return reason?.trim() || "—";
}

export function backfillOutcomeRows(
  report: CalendarAttendeeBackfillReport,
): CalendarAttendeeOutcomeRow[] {
  const patched = new Set(report.patched);
  const skippedIds = new Set(report.skipped.map((event) => event.sessionId));
  const rows: CalendarAttendeeOutcomeRow[] = [
    ...report.missing
      .filter((event) => patched.has(event.sessionId) && !skippedIds.has(event.sessionId))
      .map((event) => ({
        ...event,
        outcome: "Added" as const,
        detail: "admin@ added",
      })),
    ...report.refused.map((event) => ({
      ...event,
      outcome: "Refused" as const,
      detail: backfillReasonLabel(event.reason),
    })),
    ...(report.alreadyPresentSessions ?? []).map((event) => ({
      ...event,
      outcome: "Already present" as const,
      detail: "admin@ already on the event",
    })),
    ...report.skipped.map((event) => ({
      ...event,
      outcome: "Skipped" as const,
      detail: backfillReasonLabel(event.reason),
    })),
  ];
  return rows.sort((left, right) => (left.start ?? "").localeCompare(right.start ?? ""));
}

function requestErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The attendee preview failed.";
}

function cell(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function EventTable({
  events,
  testId,
  showReason,
  showOutcome,
}: {
  events: Array<CalendarAttendeeBackfillEvent & { outcome?: string; detail?: string }>;
  testId: string;
  showReason?: boolean;
  showOutcome?: boolean;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">None</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date/time (ET)</TableHead>
          <TableHead>Student</TableHead>
          <TableHead>Tutor</TableHead>
          <TableHead>Session type</TableHead>
          <TableHead>Event id</TableHead>
          {showOutcome ? <TableHead>Outcome</TableHead> : null}
          {showReason ? <TableHead>Reason</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={`${testId}-${event.sessionId}`} data-testid={`${testId}-${event.sessionId}`}>
            <TableCell>{formatBackfillStart(event.start)}</TableCell>
            <TableCell>{cell(event.studentName)}</TableCell>
            <TableCell>{cell(event.tutorName)}</TableCell>
            <TableCell>{cell(event.sessionType)}</TableCell>
            <TableCell>{cell(event.eventId)}</TableCell>
            {showOutcome ? (
              <TableCell>
                <span>{event.outcome ?? "—"}</span>
                {event.detail ? (
                  <span className="mt-1 block text-xs text-muted-foreground">{event.detail}</span>
                ) : null}
              </TableCell>
            ) : null}
            {showReason ? <TableCell>{backfillReasonLabel(event.reason)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ListSection({
  title,
  count,
  testId,
  events,
  showReason,
}: {
  title: string;
  count: number;
  testId: string;
  events: CalendarAttendeeBackfillEvent[];
  showReason?: boolean;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </h3>
      <EventTable events={events} testId={testId} showReason={showReason} />
    </section>
  );
}

export default function CalendarAttendeeBackfill() {
  const [preview, setPreview] = useState<CalendarAttendeeBackfillReport | null>(null);
  const [outcomes, setOutcomes] = useState<CalendarAttendeeOutcomeRow[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState("");

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "preview" : "apply");
    setError("");
    try {
      const report = await customFetch<CalendarAttendeeBackfillReport>(BACKFILL_PATH, {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      });
      if (dryRun) {
        setPreview(report);
        setOutcomes(null);
      } else {
        setPreview(null);
        setOutcomes(backfillOutcomeRows(report));
        setConfirmOpen(false);
      }
    } catch (runError) {
      setError(requestErrorMessage(runError));
    } finally {
      setBusy(null);
    }
  };

  const missingCount = preview?.missing.length ?? 0;

  return (
    <Card data-testid="calendar-attendee-backfill">
      <CardHeader>
        <CardTitle>Admin calendar attendees</CardTitle>
        <CardDescription>
          Preview upcoming events that are missing admin@acceptedadmissions.org. Adding that attendee updates the event and does not email guests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            data-testid="preview-admin-attendees"
            onClick={() => void run(true)}
          >
            {busy === "preview" ? "Previewing…" : "Preview missing admin@ (dry run)"}
          </Button>
          {preview ? (
            <Button
              type="button"
              size="sm"
              disabled={busy !== null}
              data-testid="add-admin-attendees"
              onClick={() => setConfirmOpen(true)}
            >
              Add admin@ silently
            </Button>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm font-medium text-destructive" data-testid="error-admin-attendees">
            {error}
          </p>
        ) : null}
        {preview ? (
          <div className="space-y-5" data-testid="admin-attendee-preview">
            <ListSection
              title="Missing admin@"
              count={preview.missing.length}
              testId="backfill-missing"
              events={preview.missing}
            />
            <ListSection
              title="Refused"
              count={preview.refused.length}
              testId="backfill-refused"
              events={preview.refused}
              showReason
            />
            <ListSection
              title="Already include admin@"
              count={preview.alreadyPresentSessions?.length ?? preview.alreadyPresent}
              testId="backfill-already-present"
              events={preview.alreadyPresentSessions ?? []}
            />
            <ListSection
              title="Skipped"
              count={preview.skipped.length}
              testId="backfill-skipped"
              events={preview.skipped}
              showReason
            />
          </div>
        ) : null}
        {outcomes ? (
          <section className="space-y-2" data-testid="backfill-outcomes">
            <h3 className="text-sm font-semibold">Results ({outcomes.length})</h3>
            <EventTable events={outcomes} testId="backfill-outcomes" showOutcome />
          </section>
        ) : null}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Add admin@ silently?</AlertDialogTitle>
              <AlertDialogDescription>
                {missingCount === 0
                  ? "No upcoming events are missing admin@. Nothing will be changed, and nobody is emailed."
                  : `This adds admin@acceptedadmissions.org to ${missingCount} upcoming event${missingCount === 1 ? "" : "s"}. Guests are not emailed.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy === "apply"}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy === "apply"}
                data-testid="confirm-add-admin-attendees"
                onClick={(event) => {
                  event.preventDefault();
                  void run(false);
                }}
              >
                {busy === "apply" ? "Adding…" : "Add admin@ silently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
