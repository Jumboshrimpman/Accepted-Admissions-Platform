// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { NEEL_DHARNI_USER_ID } from "./college-consulting.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { logger } from "./logger.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { NIKA_TUTOR_PROFILE_ID } from "./self-serve-availability.ts";

export type NikaPayoutEvent = "booked" | "rescheduled" | "cancelled";

/** Session fields the payout payload needs. No names or emails. */
export type NikaPayoutSession = {
  id: string;
  clientUserId: string | null;
  tutorUserId: string | null;
  dateTime: Date;
  timezone: string;
  durationMinutes: number;
};

export type NikaPayoutLog = {
  sessionId: string;
  event: NikaPayoutEvent;
  status: number;
};

type FetchImpl = typeof fetch;

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Neel is the stable users.id from college-consulting provisioning
 * (NEEL_DHARNI_USER_ID), compared to sessions.client_user_id.
 * Nika is tutor profile 46d7cfee-d0c0-4bad-93e7-d79907301684, compared to
 * the profile id whose user_id is sessions.tutor_user_id.
 * Display names and emails are not used.
 */
export function isNikaNeelPayoutPair(
  clientUserId: string | null | undefined,
  tutorProfileId: string | null | undefined,
): boolean {
  return clientUserId === NEEL_DHARNI_USER_ID && tutorProfileId === NIKA_TUTOR_PROFILE_ID;
}

/**
 * Live for payout: not archived, and booking_status is confirmed or rescheduled.
 * Archived, pending, and any other booking status are not booked.
 */
export function isNikaPayoutBookedSession(session: {
  status: string | null | undefined;
  bookingStatus: string | null | undefined;
}): boolean {
  return (
    session.status !== "archived" &&
    (session.bookingStatus === "confirmed" || session.bookingStatus === "rescheduled")
  );
}

/** One event for an admin update of a session that may already exist. */
export function nikaPayoutEventForChange(args: {
  beforeClientUserId: string | null;
  beforeTutorProfileId: string | null;
  beforeStatus: string;
  beforeBookingStatus: string;
  beforeStartsAt: Date;
  beforeDurationMinutes: number;
  afterClientUserId: string | null;
  afterTutorProfileId: string | null;
  afterStatus: string;
  afterBookingStatus: string;
  afterStartsAt: Date;
  afterDurationMinutes: number;
}): NikaPayoutEvent | null {
  const before = isNikaNeelPayoutPair(args.beforeClientUserId, args.beforeTutorProfileId) &&
    isNikaPayoutBookedSession({
      status: args.beforeStatus,
      bookingStatus: args.beforeBookingStatus,
    });
  const after = isNikaNeelPayoutPair(args.afterClientUserId, args.afterTutorProfileId) &&
    isNikaPayoutBookedSession({
      status: args.afterStatus,
      bookingStatus: args.afterBookingStatus,
    });
  if (before && !after) return "cancelled";
  if (!before && after) return "booked";
  if (
    before &&
    after &&
    (args.beforeStartsAt.getTime() !== args.afterStartsAt.getTime() ||
      args.beforeDurationMinutes !== args.afterDurationMinutes)
  ) {
    return "rescheduled";
  }
  return null;
}

export function isoWithOffset(date: Date, timeZone: string): string {
  const zone = timeZone.trim() || "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour") === "24" ? "00" : read("hour");
  const minute = read("minute");
  const second = read("second");
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const offsetMinutes = Math.round((wallClock - date.getTime()) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

export function nikaPayoutPayload(args: {
  event: NikaPayoutEvent;
  session: NikaPayoutSession;
  sentAt: Date;
}): {
  event: NikaPayoutEvent;
  sessionId: string;
  startsAt: string;
  durationMinutes: number;
  endsAt: string;
  tutor: "nika";
  student: "neel";
  sentAt: string;
} {
  const endsAt = new Date(args.session.dateTime.getTime() + args.session.durationMinutes * 60_000);
  return {
    event: args.event,
    sessionId: args.session.id,
    startsAt: isoWithOffset(args.session.dateTime, args.session.timezone),
    durationMinutes: args.session.durationMinutes,
    endsAt: isoWithOffset(endsAt, args.session.timezone),
    tutor: "nika",
    student: "neel",
    sentAt: isoWithOffset(args.sentAt, "UTC"),
  };
}

function webhookUrl(env: NodeJS.ProcessEnv): string | null {
  const url = env.NIKA_PAYOUT_WEBHOOK_URL?.trim() ?? "";
  return url.length > 0 ? url : null;
}

function authHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  const key = env.NIKA_PAYOUT_WEBHOOK_KEY ?? "";
  const headerName = env.NIKA_PAYOUT_WEBHOOK_KEY_HEADER?.trim() ?? "";
  if (headerName) return { [headerName]: key };
  return { authorization: `Bearer ${key}` };
}

function logStatus(
  log: ((fields: NikaPayoutLog) => void) | undefined,
  fields: NikaPayoutLog,
): void {
  if (log) {
    log(fields);
    return;
  }
  logger.info(fields, "Nika payout webhook");
}

async function postOnce(
  url: string,
  body: string,
  headers: Record<string, string>,
  fetchImpl: FetchImpl,
  timeoutMs: number,
): Promise<number> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  await discardResponseBody(response);
  return response.status;
}

async function discardResponseBody(response: Response): Promise<void> {
  try {
    await response.arrayBuffer();
  } catch {
    // A body that cannot be read must not hide the HTTP status.
  }
}

async function postWithOneRetry(
  url: string,
  body: string,
  headers: Record<string, string>,
  fetchImpl: FetchImpl,
  timeoutMs: number,
): Promise<number> {
  try {
    const status = await postOnce(url, body, headers, fetchImpl, timeoutMs);
    if (status >= 200 && status < 300) return status;
  } catch {
    // One retry below. The error can contain the URL, so it is not logged.
  }
  try {
    return await postOnce(url, body, headers, fetchImpl, timeoutMs);
  } catch {
    return 0;
  }
}

type DeliverOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchImpl;
  now?: Date;
  log?: (fields: NikaPayoutLog) => void;
  timeoutMs?: number;
};

async function postPayload(
  event: NikaPayoutEvent,
  session: NikaPayoutSession,
  options: DeliverOptions,
): Promise<void> {
  const env = options.env ?? process.env;
  const url = webhookUrl(env);
  if (!url) return;
  const payload = nikaPayoutPayload({ event, session, sentAt: options.now ?? new Date() });
  const status = await postWithOneRetry(
    url,
    JSON.stringify(payload),
    authHeaders(env),
    options.fetchImpl ?? fetch,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  logStatus(options.log, { sessionId: session.id, event, status });
}

export async function deliverNikaPayoutWebhook(args: DeliverOptions & {
  event: NikaPayoutEvent;
  session: NikaPayoutSession;
  tutorProfileId?: string | null;
  resolveTutorProfileId?: (tutorUserId: string) => Promise<string | null>;
}): Promise<void> {
  try {
    const env = args.env ?? process.env;
    if (!webhookUrl(env)) return;
    if (args.session.clientUserId !== NEEL_DHARNI_USER_ID) return;
    let tutorProfileId = args.tutorProfileId ?? null;
    if (!tutorProfileId && args.session.tutorUserId && args.resolveTutorProfileId) {
      tutorProfileId = await args.resolveTutorProfileId(args.session.tutorUserId);
    }
    if (!isNikaNeelPayoutPair(args.session.clientUserId, tutorProfileId)) return;
    await postPayload(args.event, args.session, args);
  } catch {
    logStatus(args.log, { sessionId: args.session.id, event: args.event, status: 0 });
  }
}

export function scheduleNikaPayoutWebhook(args: Parameters<typeof deliverNikaPayoutWebhook>[0]): void {
  void deliverNikaPayoutWebhook(args).catch(() => undefined);
}

export async function deliverNikaPayoutChange(args: DeliverOptions & {
  before: NikaPayoutSession & { status: string; bookingStatus: string };
  after: NikaPayoutSession & { status: string; bookingStatus: string };
  beforeTutorProfileId: string | null;
  afterTutorProfileId: string | null;
}): Promise<void> {
  let event: NikaPayoutEvent | null = null;
  try {
    const env = args.env ?? process.env;
    if (!webhookUrl(env)) return;
    event = nikaPayoutEventForChange({
      beforeClientUserId: args.before.clientUserId,
      beforeTutorProfileId: args.beforeTutorProfileId,
      beforeStatus: args.before.status,
      beforeBookingStatus: args.before.bookingStatus,
      beforeStartsAt: args.before.dateTime,
      beforeDurationMinutes: args.before.durationMinutes,
      afterClientUserId: args.after.clientUserId,
      afterTutorProfileId: args.afterTutorProfileId,
      afterStatus: args.after.status,
      afterBookingStatus: args.after.bookingStatus,
      afterStartsAt: args.after.dateTime,
      afterDurationMinutes: args.after.durationMinutes,
    });
    if (!event) return;
    await postPayload(event, args.after, args);
  } catch {
    logStatus(args.log, {
      sessionId: args.after.id,
      event: event ?? "cancelled",
      status: 0,
    });
  }
}

export function scheduleNikaPayoutChange(args: {
  before: NikaPayoutSession & { status: string; bookingStatus: string };
  after: NikaPayoutSession & { status: string; bookingStatus: string };
  resolveTutorProfileId: (tutorUserId: string) => Promise<string | null>;
}): void {
  void (async () => {
    try {
      if (!webhookUrl(process.env)) return;
      if (
        args.before.clientUserId !== NEEL_DHARNI_USER_ID &&
        args.after.clientUserId !== NEEL_DHARNI_USER_ID
      ) {
        return;
      }
      const beforeTutorProfileId = args.before.tutorUserId
        ? await args.resolveTutorProfileId(args.before.tutorUserId)
        : null;
      const afterTutorProfileId =
        args.after.tutorUserId === args.before.tutorUserId
          ? beforeTutorProfileId
          : args.after.tutorUserId
            ? await args.resolveTutorProfileId(args.after.tutorUserId)
            : null;
      await deliverNikaPayoutChange({
        before: args.before,
        after: args.after,
        beforeTutorProfileId,
        afterTutorProfileId,
      });
    } catch {
      // Lookup failures stay off the booking response.
    }
  })();
}
