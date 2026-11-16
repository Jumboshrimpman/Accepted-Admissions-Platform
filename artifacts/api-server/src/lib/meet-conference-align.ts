// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  updateGoogleEvent,
  type GoogleCalendarEvent,
} from "./google-calendar.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  googleMeetUrl,
  persistableDedicatedMeetUrl,
} from "./session-meeting-url.ts";

export const MEET_CONFERENCE_DIVERGED_MESSAGE =
  "calendar meet conference diverged from intended room";
export const MEET_CONFERENCE_KEEP_INTENDED_MESSAGE =
  "calendar meet conference diverged; keeping the dedicated room on the portal";

export type GoogleMeetEventFields = {
  hangoutLink?: string | null;
  location?: string | null;
  description?: string | null;
  conferenceData?: {
    conferenceId?: string | null;
    entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null;
  } | null;
};

export type AlignedMeeting = {
  meetUrl: string | null;
  intendedUrl: string | null;
  conferenceUrl: string | null;
  diverged: boolean;
  keepIntended: boolean;
};

/** The event's real Google Meet button: hangoutLink, then a video entry point. */
export function eventConferenceMeetUrl(
  event: GoogleMeetEventFields | null | undefined,
): string | null {
  if (!event) return null;
  const fromHangout = googleMeetUrl(event.hangoutLink);
  if (fromHangout) return fromHangout;
  const entries = event.conferenceData?.entryPoints ?? [];
  for (const entry of entries) {
    if (entry?.entryPointType && entry.entryPointType !== "video") continue;
    const uri = googleMeetUrl(entry?.uri);
    if (uri) return uri;
  }
  const fromId = event.conferenceData?.conferenceId?.trim();
  if (fromId && /^[a-z0-9-]+$/i.test(fromId)) {
    return googleMeetUrl(`https://meet.google.com/${fromId}`);
  }
  return null;
}

export function replaceMeetUrlInText(
  text: string | null | undefined,
  from: string | null,
  to: string | null,
): string | undefined {
  if (!to) return text ?? undefined;
  const current = text ?? "";
  if (!current.trim()) return to;
  if (from && current.includes(from) && from !== to) {
    return current.split(from).join(to);
  }
  if (googleMeetUrl(current) && googleMeetUrl(current) !== to) return to;
  if (!current.includes(to) && !googleMeetUrl(current)) {
    return `${current.trim()}\n${to}`;
  }
  return current;
}

/**
 * When a booking targeted a specific room (Michelle ase, Sophia S xqq, Taito
 * rih, or Neel's persisted room), keep that room on the portal even if Google
 * attaches a different conference button. When there was no intended room
 * (Neel's first booking), persist the real hangoutLink only if it is not
 * Taito's rih room.
 */
export function alignMeetingToConference(input: {
  intendedUrl?: string | null;
  event: GoogleMeetEventFields;
}): AlignedMeeting {
  const intendedUrl = googleMeetUrl(input.intendedUrl);
  const conferenceUrl = eventConferenceMeetUrl(input.event);
  if (intendedUrl) {
    return {
      meetUrl: intendedUrl,
      intendedUrl,
      conferenceUrl,
      diverged: Boolean(conferenceUrl && conferenceUrl !== intendedUrl),
      keepIntended: true,
    };
  }
  const persistable = persistableDedicatedMeetUrl(conferenceUrl);
  return {
    meetUrl: persistable,
    intendedUrl: null,
    conferenceUrl,
    diverged: Boolean(conferenceUrl && !persistable),
    keepIntended: false,
  };
}

export async function reconcileCreatedMeetEvent(input: {
  accessToken: string;
  calendarId: string;
  event: GoogleCalendarEvent & GoogleMeetEventFields;
  intendedUrl?: string | null;
  log?: (fields: Record<string, unknown>, message: string) => void;
}): Promise<{
  event: GoogleCalendarEvent & GoogleMeetEventFields;
  alignment: AlignedMeeting;
}> {
  const alignment = alignMeetingToConference({
    intendedUrl: input.intendedUrl,
    event: input.event,
  });
  if (alignment.diverged) {
    input.log?.(
      {
        eventId: input.event.id,
        calendarId: input.calendarId,
        intendedUrl: alignment.intendedUrl,
        conferenceUrl: alignment.conferenceUrl,
        keepIntended: alignment.keepIntended,
        level: "error",
      },
      alignment.keepIntended
        ? MEET_CONFERENCE_KEEP_INTENDED_MESSAGE
        : MEET_CONFERENCE_DIVERGED_MESSAGE,
    );
  }
  const eventId = input.event.id;
  if (!eventId || !alignment.meetUrl) {
    return { event: input.event, alignment };
  }
  const nextLocation = alignment.meetUrl;
  const nextDescription = replaceMeetUrlInText(
    input.event.description,
    alignment.conferenceUrl ?? alignment.intendedUrl,
    alignment.meetUrl,
  );
  const locationMatches = googleMeetUrl(input.event.location) === alignment.meetUrl;
  const descriptionAlreadyAligned =
    Boolean(input.event.description && alignment.meetUrl && input.event.description.includes(alignment.meetUrl));
  if (locationMatches && descriptionAlreadyAligned) {
    return { event: input.event, alignment };
  }
  const patched = await updateGoogleEvent(
    input.accessToken,
    input.calendarId,
    eventId,
    {
      location: nextLocation,
      ...(nextDescription !== undefined ? { description: nextDescription } : {}),
    },
    "none",
  );
  return {
    event: { ...input.event, ...patched, location: nextLocation, description: nextDescription },
    // Keep the intended room when we refused to follow a diverged conference button.
    alignment,
  };
}
