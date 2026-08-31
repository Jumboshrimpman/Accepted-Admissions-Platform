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
  const connection = connectionsQuery.data?.[0];
  const connected = connection?.status === "connected";
  const refetchConnections = connectionsQuery.refetch;
  const connectUrl = "/api/calendar/connect?redirect=1";

  const trackCalendarOutcome = useCallback(
    (outcome: CalendarConnectionOutcome) => {
      const role = currentUserQuery.data?.role;
      if (!role) return;
      trackCalendarConnection(role, location, outcome);
    },
    [currentUserQuery.data?.role, location],
  );

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
      const result = data as { type: string; outcome?: string };
      if (result.type === "accepted-admissions:calendar-connected") {
        trackCalendarOutcome("connected");
        setShowConnectFallback(false);
        void refetchConnections();
        setMessage("Google Calendar connected successfully.");
      } else {
        const outcome: CalendarConnectionOutcome =
          result.outcome === "cancelled"
            ? "cancelled"
            : result.outcome === "rejected"
              ? "rejected"
              : "failed";
        trackCalendarOutcome(outcome);
        setMessage(
          "Google Calendar authorization was not completed. Check the authorization window and try again.",
        );
      }
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
  }, [refetchConnections, trackCalendarOutcome]);

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
      setMessage(
        "Your browser blocked the Google authorization window. Use the link below to open it directly.",
      );
      return;
    }
    setMessage(
      "Google authorization opened in a separate window. Return here after granting access.",
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
        {showConnectFallback && (
          <Button asChild variant="outline" className="mt-3 rounded-full">
            <a
              href={connectUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackCalendarOutcome("popup_launched")}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Open Google authorization
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}