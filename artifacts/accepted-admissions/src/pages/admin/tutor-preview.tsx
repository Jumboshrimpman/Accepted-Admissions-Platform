import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { customFetch, type Dashboard } from "@workspace/api-client-react";
import { ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TutorDashboardView } from "@/pages/tutor/dashboard";
import type { DateHoursState } from "@/pages/tutor/date-hours-editor";
import type { OfferedAvailability } from "@/pages/tutor/offered-availability";

type TutorPreviewPayload = {
  tutorProfileId: string;
  readOnly: true;
  dashboard: Dashboard;
  reviewQueue: Array<{
    id: string;
    attemptId: string;
    status: string;
    reason: string;
    skill: string;
  }>;
  dateHours: DateHoursState | null;
  dateHoursUnavailable: boolean;
  offeredAvailability: OfferedAvailability | null;
  offeredAvailabilityError: boolean;
  googleBusyTimesOmitted: boolean;
  calendar: { status: "connected" | "disconnected" };
};

export default function AdminTutorPreview() {
  const params = useParams();
  const tutorId = params.tutorId as string;
  const [payload, setPayload] = useState<TutorPreviewPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tutorId) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        const next = await customFetch<TutorPreviewPayload>(
          `/api/admin/tutors/${tutorId}/preview`,
        );
        if (!cancelled) setPayload(next);
      } catch {
        if (!cancelled) {
          setPayload(null);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tutorId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-[32rem] rounded-3xl" />
      </div>
    );
  }

  if (failed || !payload) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-4 p-8 text-center">
          <h1 className="text-xl font-semibold">Tutor preview unavailable</h1>
          <p className="text-sm text-muted-foreground">
            The tutor could not be found, or this account is not allowed to preview the dashboard.
          </p>
          <Button asChild variant="outline">
            <Link href="/admin/connections">
              <ArrowLeft className="mr-2 h-4 w-4" /> Return to connections
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tutorName = payload.dashboard.user.displayName;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <div
        className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        data-testid="tutor-preview-banner"
      >
        <div className="flex items-start gap-3">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h1 className="font-semibold">Administrator tutor preview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This frame uses {tutorName}&apos;s tutor dashboard. Saving hours, calendar changes,
              session edits, and review updates stay off.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/admin/connections">
            <ArrowLeft className="mr-2 h-4 w-4" /> Return to connections
          </Link>
        </Button>
      </div>
      <div className="min-w-0 overflow-x-hidden rounded-3xl border-2 border-dashed border-primary/25 bg-muted/20 p-2 sm:p-4">
        <TutorDashboardView
          dashboard={payload.dashboard}
          queue={payload.reviewQueue}
          readOnly
          dateHours={payload.dateHours}
          dateHoursUnavailable={payload.dateHoursUnavailable}
          offeredAvailability={payload.offeredAvailability}
          offeredAvailabilityError={payload.offeredAvailabilityError}
          googleBusyTimesOmitted={payload.googleBusyTimesOmitted}
          calendarStatus={payload.calendar.status}
        />
      </div>
    </div>
  );
}
