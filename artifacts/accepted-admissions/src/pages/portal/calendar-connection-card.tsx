import { useCallback, useEffect, useState } from "react";
import {
  CalendarCheck2,
  ExternalLink,
  Link2Off,
  Loader2,
  Unplug,
} from "lucide-react";
import {
  useGetCurrentUser,
  useDisconnectCalendar,
  useListCalendarConnections,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  trackCalendarConnection,
  type CalendarConnectionLocation,
  type CalendarConnectionOutcome,
} from "@/lib/analytics";

const CALENDAR_FAILURE_MESSAGES: Record<string, string> = {
  cancelled: "You cancelled Google authorization. No calendar changes were made.",
  rejected:
    "Google rejected authorization, or the chosen account does not match this portal email.",
  misconfigured:
    "Google Calendar is not configured for this workspace. Ask an administrator to check the Calendar environment variables.",
  redirect_mismatch:
    "Google rejected the return URL. An administrator must allowlist the exact Calendar callback URL in Google Cloud Console.",
  unavailable: "Google Calendar is temporarily unavailable. Try again in a few minutes.",
  expired:
    "This authorization link expired or is no longer valid. Start Connect again from the dashboard.",
  failed: "Google Calendar authorization failed. Close the authorization window and try again.",
};

export function calendarConnectReturnTo(
  location: CalendarConnectionLocation,
): "/tutor" | "/portal" | "/admin" {
  if (location === "tutor_dashboard") return "/tutor";
  if (location === "admin_dashboard") return "/admin";
  return "/portal";
}

export function calendarConnectUrl(location: CalendarConnectionLocation): string {
  const returnTo = calendarConnectReturnTo(location);
  return `/api/calendar/connect?redirect=1&returnTo=${encodeURIComponent(returnTo)}`;
}

export function messageForCalendarOutcome(
  outcome: string | undefined,
  explicitMessage?: string,
): string {
  if (explicitMessage?.trim()) return explicitMessage.trim();
  return CALENDAR_FAILURE_MESSAGES[outcome ?? ""] ?? CALENDAR_FAILURE_MESSAGES.failed;
}

export function readCalendarReturnQuery(search = window.location.search): {
  success: boolean;
  outcome: CalendarConnectionOutcome;
  message: string;
} | null {
  const params = new URLSearchParams(search);
  const calendar = params.get("calendar");
  const reason = params.get("reason") ?? undefined;
  if (calendar === "connected") {
    return {
      success: true,
      outcome: "connected",
      message: "Google Calendar connected successfully.",
    };
  }
  if (calendar === "error") {
    const outcome: CalendarConnectionOutcome =
      reason === "cancelled" ||
      reason === "rejected" ||
      reason === "misconfigured" ||
      reason === "redirect_mismatch" ||
      reason === "unavailable" ||
      reason === "expired"
        ? reason
        : "failed";
    return {
      success: false,
      outcome,
      message: messageForCalendarOutcome(outcome),
    };
  }
  return null;
}

function clearCalendarReturnQuery(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("calendar") && !url.searchParams.has("reason")) return;
  url.searchParams.delete("calendar");
  url.searchParams.delete("reason");
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export function CalendarConnectionCard({
  location,
}: {
  location: CalendarConnectionLocation;
}) {
  const currentUserQuery = useGetCurrentUser();
  const connectionsQuery = useListCalendarConnections();
  const disconnect = useDisconnectCalendar();
  const [message, setMessage] = useState("");
  const [showConnectFallback, setShowConnectFallback] = useState(false);
  const [awaitingAuthorization, setAwaitingAuthorization] = useState(false);
  const connection = connectionsQuery.data?.[0];
  const connected = connection?.status === "connected";
  const refetchConnections = connectionsQuery.refetch;
  const connectUrl = calendarConnectUrl(location);

  const trackCalendarOutcome = useCallback(
    (outcome: CalendarConnectionOutcome) => {
      const role = currentUserQuery.data?.role;
      if (!role) return;
      try {
        trackCalendarConnection(role, location, outcome);
      } catch {
        // Analytics must never interrupt the calendar connection flow.
      }
    },
    [currentUserQuery.data?.role, location],
  );

  const applyCalendarResult = useCallback(
    (result: { type?: string; outcome?: string; message?: string }) => {
      if (result.type === "accepted-admissions:calendar-connected") {
        trackCalendarOutcome("connected");
        setShowConnectFallback(false);
        setAwaitingAuthorization(false);
        void refetchConnections();
        setMessage("Google Calendar connected successfully.");
        return;
      }
      const outcome: CalendarConnectionOutcome =
        result.outcome === "cancelled" ||
        result.outcome === "rejected" ||
        result.outcome === "misconfigured" ||
        result.outcome === "redirect_mismatch" ||
        result.outcome === "unavailable" ||
        result.outcome === "expired"
          ? result.outcome
          : "failed";
      trackCalendarOutcome(outcome);
      setAwaitingAuthorization(false);
      setShowConnectFallback(true);
      setMessage(messageForCalendarOutcome(outcome, result.message));
    },
    [refetchConnections, trackCalendarOutcome],
  );

  useEffect(() => {
    const returned = readCalendarReturnQuery();
    if (!returned) return;
    applyCalendarResult({
      type: returned.success
        ? "accepted-admissions:calendar-connected"
        : "accepted-admissions:calendar-connection-failed",
      outcome: returned.outcome,
      message: returned.message,
    });
    clearCalendarReturnQuery();
  }, [applyCalendarResult]);

  useEffect(() => {
    const receiveCalendarConnection = (data: unknown) => {
      if (
        !data ||
        typeof data !== "object" ||
        ![
          "accepted-admissions:calendar-connected",
          "accepted-admissions:calendar-connection-failed",
        ].includes((data as { type?: string }).type ?? "")
      ) {
        return;
      }
      applyCalendarResult(data as { type: string; outcome?: string; message?: string });
    };
    const receiveWindowMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin) {
        receiveCalendarConnection(event.data);
      }
    };
    const broadcastChannel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("accepted-admissions:calendar-connection");
    const receiveBroadcastMessage = (event: MessageEvent) => {
      receiveCalendarConnection(event.data);
    };

    window.addEventListener("message", receiveWindowMessage);
    broadcastChannel?.addEventListener("message", receiveBroadcastMessage);
    return () => {
      window.removeEventListener("message", receiveWindowMessage);
      broadcastChannel?.removeEventListener("message", receiveBroadcastMessage);
      broadcastChannel?.close();
    };
  }, [applyCalendarResult]);

  useEffect(() => {
    if (!awaitingAuthorization) return;
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refetchConnections().then((result) => {
        const latest = result.data?.[0];
        if (latest?.status === "connected") {
          setAwaitingAuthorization(false);
          setShowConnectFallback(false);
          setMessage("Google Calendar connected successfully.");
          trackCalendarOutcome("connected");
        }
      });
    };
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [awaitingAuthorization, refetchConnections, trackCalendarOutcome]);

  const connectCalendar = () => {
    setMessage("");
    setShowConnectFallback(false);
    trackCalendarOutcome("popup_launched");
    const authorizationWindow = window.open(
      connectUrl,
      "accepted-google-calendar",
    );
    if (!authorizationWindow) {
      trackCalendarOutcome("popup_blocked");
      setShowConnectFallback(true);
      setAwaitingAuthorization(false);
      setMessage(
        "Your browser blocked the Google authorization window. Continue in this tab or open it in a new window.",
      );
      return;
    }
    setAwaitingAuthorization(true);
    setShowConnectFallback(true);
    setMessage(
      "Google authorization opened in a separate window. Return here after granting access, or continue in this tab if the window does not update.",
    );
  };

  const disconnectCalendar = () => {
    if (!connection) return;
    disconnect.mutate(
      { tutorProfileId: connection.tutorProfileId },
      {
        onSuccess: () => {
          trackCalendarOutcome("disconnected");
          void connectionsQuery.refetch();
          setMessage("Google Calendar disconnected. Students will no longer see times until it is reconnected.");
        },
        onError: () => {
          trackCalendarOutcome("disconnect_failed");
          setMessage("The calendar could not be disconnected. Please try again.");
        },
      },
    );
  };

  return (
    <Card className="border-primary/10 shadow-lg shadow-primary/5">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CalendarCheck2 className="h-5 w-5 text-primary" />
              Google Calendar
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl">
              Connect this account's Google Calendar using the same email as your portal sign-in. Availability checks use free/busy data only, and private event details never leave the server.
            </CardDescription>
          </div>
          <Badge variant={connected ? "default" : "secondary"} className="w-fit rounded-full px-3 py-1">
            {connectionsQuery.isLoading ? "Checking…" : connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {connected ? (
          <div className="flex flex-col gap-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Your calendar is connected.</p>
              <p className="mt-1 text-emerald-800">Availability checks use free/busy data only.</p>
            </div>
            <Button variant="outline" className="rounded-full border-emerald-300 bg-white" onClick={disconnectCalendar} disabled={disconnect.isPending}>
              {disconnect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Link2Off className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm">
              <p className="font-medium">Connect your calendar</p>
              <p className="mt-1 text-muted-foreground">Your calendar stays private while the app checks availability.</p>
              </div>
            </div>
            <Button className="rounded-full" onClick={connectCalendar}>
              <ExternalLink className="mr-2 h-4 w-4" /> Connect Google Calendar
            </Button>
          </div>
        )}
        {message && <p className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>}
        {showConnectFallback && !connected && (
          <div className="mt-3 flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-full">
              <a
                href={connectUrl}
                target="_blank"
                onClick={() => trackCalendarOutcome("popup_launched")}
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Open Google authorization
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <a href={connectUrl} onClick={() => trackCalendarOutcome("popup_launched")}>
                Continue in this tab
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
