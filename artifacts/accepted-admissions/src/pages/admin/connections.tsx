import { useEffect, useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import CalendarAttendeeBackfill from "./calendar-attendee-backfill";

export type CalendarConnectionHealthRow = {
  tutorProfileId: string;
  name: string;
  portalEmail: string;
  connectionStatus: "connected" | "disconnected";
  badge: "healthy" | "needs_attention" | "needs_reconnect" | "not_connected";
  googleAccountMasked: string | null;
  calendarIdMasked: string | null;
  hasRefreshToken: boolean;
  lastTokenRefreshAt: string | null;
  lastFreeBusyAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  bookable: boolean;
  hasUpcomingBookableTime: boolean;
  estimatedTokenAgeDays: number | null;
  testingModeExpiryWarning: string | null;
};

const BADGE_LABEL = {
  healthy: "Healthy",
  needs_attention: "Needs attention",
  needs_reconnect: "Needs reconnect",
  not_connected: "Not connected",
} as const;

function connectionTestErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The free/busy check failed.";
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatEstimatedTokenAge(days: number | null): string {
  if (days == null) return "Unknown";
  if (days < 1) return "Less than 1 day";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function reconnectIndicator(row: CalendarConnectionHealthRow): "Connected" | "Needs reconnect" | "Not connected" {
  if (row.badge === "needs_reconnect") return "Needs reconnect";
  if (row.badge === "not_connected" || row.connectionStatus === "disconnected") return "Not connected";
  return "Connected";
}

function badgeClass(badge: CalendarConnectionHealthRow["badge"]): string {
  if (badge === "healthy") return "border-transparent bg-emerald-600 text-white hover:bg-emerald-600";
  if (badge === "needs_attention") return "border-transparent bg-amber-600 text-white hover:bg-amber-600";
  if (badge === "needs_reconnect") return "border-transparent bg-amber-500 text-amber-950 hover:bg-amber-500";
  return "border-transparent bg-muted text-muted-foreground hover:bg-muted";
}

export default function AdminConnections() {
  const [connections, setConnections] = useState<CalendarConnectionHealthRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [linkPendingId, setLinkPendingId] = useState<string | null>(null);
  const [reconnectLinks, setReconnectLinks] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const payload = await customFetch<{ connections: CalendarConnectionHealthRow[] }>(
        "/api/admin/calendar-connections",
      );
      setConnections(payload.connections ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load calendar connections.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const testConnection = async (tutorProfileId: string) => {
    setPendingId(tutorProfileId);
    setError("");
    try {
      const payload = await customFetch<{ connection: CalendarConnectionHealthRow }>(
        `/api/admin/calendar-connections/${tutorProfileId}/test`,
        { method: "POST" },
      );
      setConnections((current) =>
        current.map((row) =>
          row.tutorProfileId === payload.connection.tutorProfileId ? payload.connection : row,
        ),
      );
    } catch (testError) {
      setError(connectionTestErrorMessage(testError));
    } finally {
      setPendingId(null);
    }
  };

  const createReconnectLink = async (tutorProfileId: string) => {
    setLinkPendingId(tutorProfileId);
    setError("");
    setCopiedId(null);
    try {
      const payload = await customFetch<{ url: string; expiresAt: string }>(
        `/api/admin/calendar-connections/${tutorProfileId}/reconnect-link`,
        { method: "POST" },
      );
      setReconnectLinks((current) => ({ ...current, [tutorProfileId]: payload.url }));
      try {
        await navigator.clipboard.writeText(payload.url);
        setCopiedId(tutorProfileId);
      } catch {
        setCopiedId(null);
      }
    } catch (linkError) {
      setError(connectionTestErrorMessage(linkError));
    } finally {
      setLinkPendingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div>
        <p className="mb-2 text-sm font-medium text-primary">Accepted Admissions · administrator</p>
        <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
        <p className="mt-1 text-muted-foreground">
          Google Calendar health for each tutor. Test now runs a read-only free/busy check and does not email anyone or change the calendar.
        </p>
      </div>
      {error ? (
        <p className="text-sm font-medium text-destructive" data-testid="error-calendar-connections">
          {error}
        </p>
      ) : null}
      <CalendarAttendeeBackfill />
      {loading ? <p className="text-sm text-muted-foreground">Loading connections…</p> : null}
      {!loading && connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tutor profiles to show.</p>
      ) : null}
      <div className="space-y-4">
        {connections.map((row) => (
          <Card key={row.tutorProfileId} data-testid={`calendar-connection-${row.tutorProfileId}`}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">{row.name}</CardTitle>
                <CardDescription>{row.portalEmail}</CardDescription>
              </div>
              <Badge
                className={badgeClass(row.badge)}
                data-testid={`badge-calendar-connection-${row.tutorProfileId}`}
              >
                {BADGE_LABEL[row.badge]}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Connection status</dt>
                  <dd data-testid={`status-calendar-connection-${row.tutorProfileId}`}>
                    {reconnectIndicator(row)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Google account</dt>
                  <dd>{row.googleAccountMasked ?? "Not connected"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Calendar</dt>
                  <dd>{row.calendarIdMasked ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Refresh token</dt>
                  <dd>{row.hasRefreshToken ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last successful refresh</dt>
                  <dd>
                    <time dateTime={row.lastTokenRefreshAt ?? undefined}>{formatWhen(row.lastTokenRefreshAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Estimated token age</dt>
                  <dd data-testid={`token-age-${row.tutorProfileId}`}>
                    {formatEstimatedTokenAge(row.estimatedTokenAgeDays)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last free/busy success</dt>
                  <dd>
                    <time dateTime={row.lastFreeBusyAt ?? undefined}>{formatWhen(row.lastFreeBusyAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Bookable</dt>
                  <dd>{row.bookable ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Upcoming bookable time</dt>
                  <dd>{row.hasUpcomingBookableTime ? "Yes" : "No"}</dd>
                </div>
              </dl>
              <p className="text-sm">
                <span className="text-muted-foreground">Last error: </span>
                {row.lastError ? (
                  <>
                    {row.lastError}
                    {row.lastErrorAt ? (
                      <time className="ml-2 text-xs text-muted-foreground" dateTime={row.lastErrorAt}>
                        {formatWhen(row.lastErrorAt)}
                      </time>
                    ) : null}
                  </>
                ) : (
                  "None"
                )}
              </p>
              {row.testingModeExpiryWarning ? (
                <p
                  role="status"
                  className="rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                  data-testid={`warning-testing-mode-${row.tutorProfileId}`}
                >
                  {row.testingModeExpiryWarning}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingId === row.tutorProfileId}
                  onClick={() => void testConnection(row.tutorProfileId)}
                  data-testid={`test-calendar-connection-${row.tutorProfileId}`}
                >
                  {pendingId === row.tutorProfileId ? "Testing…" : "Test now"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={linkPendingId === row.tutorProfileId}
                  onClick={() => void createReconnectLink(row.tutorProfileId)}
                  data-testid={`copy-reconnect-link-${row.tutorProfileId}`}
                >
                  {linkPendingId === row.tutorProfileId
                    ? "Creating link…"
                    : copiedId === row.tutorProfileId
                      ? "Copied reconnect link"
                      : "Copy reconnect link"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Text this link to the tutor. It is signed to their account, expires in 24 hours, and works once.
              </p>
              {reconnectLinks[row.tutorProfileId] ? (
                <input
                  readOnly
                  value={reconnectLinks[row.tutorProfileId]}
                  aria-label={`Reconnect link for ${row.name}`}
                  className="h-10 w-full rounded-md border bg-background px-3 text-xs"
                  data-testid={`reconnect-link-${row.tutorProfileId}`}
                  onFocus={(event) => event.currentTarget.select()}
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
