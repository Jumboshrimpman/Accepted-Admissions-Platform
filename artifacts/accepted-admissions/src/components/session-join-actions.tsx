import { CalendarDays, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

type JoinSize = "sm" | "lg" | "default";

export function SessionJoinActions({
  meetingUrl,
  calendarEventUrl,
  size = "sm",
  meetingLabel = "Join meeting",
  calendarLabel = "Open calendar",
  className,
}: {
  meetingUrl?: string | null;
  calendarEventUrl?: string | null;
  size?: JoinSize;
  meetingLabel?: string;
  calendarLabel?: string;
  className?: string;
}) {
  if (!meetingUrl && !calendarEventUrl) return null;
  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {meetingUrl ? (
        <Button asChild variant="outline" size={size}>
          <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
            <Video className="mr-2 h-4 w-4" />
            {meetingLabel}
          </a>
        </Button>
      ) : null}
      {calendarEventUrl ? (
        <Button asChild variant="ghost" size={size}>
          <a href={calendarEventUrl} target="_blank" rel="noopener noreferrer">
            <CalendarDays className="mr-2 h-4 w-4" />
            {calendarLabel}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
