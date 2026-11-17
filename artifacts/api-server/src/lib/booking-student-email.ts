import { eq, inArray } from "drizzle-orm";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { meetUrlFromSessionFields } from "./booking-admin-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { logger } from "./logger.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { formatPreworkInstant, preworkReminderTimezone } from "./prework-reminders.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { CANONICAL_APP_ORIGIN } from "./public-origin.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { isCancelledBooking } from "./session-listing.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { googleMeetUrl } from "./session-meeting-url.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  sendTransactionalEmail,
  verifiedFromAddress,
  type TransactionalEmailResult,
} from "./transactional-email.ts";

export const STUDENT_BOOKING_CONFIRMATION_TIMEOUT_MS = 5_000;
export const STUDENT_BOOKING_CONFIRMATION_PORTAL_URL = `${CANONICAL_APP_ORIGIN}/portal`;

export type StudentBookingConfirmationInput = {
  studentName: string;
  sessionTitle: string;
  tutorName: string;
  start: Date | string;
  clientTimezone?: string | null;
  sessionTimezone?: string | null;
  durationMinutes: number;
  meetUrl?: string | null;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function firstNameFromDisplayName(displayName: string | null | undefined): string {
  return cleanText(displayName).split(/\s+/)[0] || "there";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatBookingDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Time not available";
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(hours === 1 ? "1 hour" : `${hours} hours`);
  if (mins > 0) parts.push(mins === 1 ? "1 minute" : `${mins} minutes`);
  return parts.join(" ");
}

/** Student-local date and time, with Eastern Time also shown. */
export function formatBookingWhen(
  start: Date | string,
  clientTimezone?: string | null,
  sessionTimezone?: string | null,
): string {
  const instant = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(instant.getTime())) return "Time not available";
  const studentZone = preworkReminderTimezone(clientTimezone, sessionTimezone);
  const student = formatPreworkInstant(instant, studentZone);
  const eastern = formatPreworkInstant(instant, "America/New_York");
  if (studentZone === "America/New_York" || student === eastern) return eastern;
  const studentDay = student.split(" at ")[0] ?? student;
  const easternDay = eastern.split(" at ")[0] ?? eastern;
  const easternTime = eastern.includes(" at ")
    ? eastern.slice(eastern.indexOf(" at ") + 4)
    : eastern;
  if (studentDay === easternDay) return `${student} (${easternTime})`;
  return `${student} (${eastern})`;
}

/**
 * A real stored Meet room only. Calendar htmlLinks are ignored unless they
 * already contain a meet.google.com URL. Nothing is invented.
 */
export function resolvedStoredMeetUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const value of candidates) {
    const meet = googleMeetUrl(value) ?? meetUrlFromSessionFields(value);
    if (meet) return googleMeetUrl(meet) ?? meet;
  }
  return null;
}

export function studentBookingConfirmationSubject(tutorName: string): string {
  const tutor = cleanText(tutorName);
  return tutor ? `Your session with ${tutor} is booked` : "Your session is booked";
}

export function studentBookingConfirmationEmail(input: StudentBookingConfirmationInput): {
  from: string;
  subject: string;
  text: string;
  html: string;
} {
  const first = firstNameFromDisplayName(input.studentName);
  const title = cleanText(input.sessionTitle) || "your session";
  const tutor = cleanText(input.tutorName) || "your tutor";
  const when = formatBookingWhen(input.start, input.clientTimezone, input.sessionTimezone);
  const length = formatBookingDuration(input.durationMinutes);
  const meet = resolvedStoredMeetUrl(input.meetUrl);
  const portal = STUDENT_BOOKING_CONFIRMATION_PORTAL_URL;
  const lines = [
    `Hi ${first},`,
    "",
    "Your session is confirmed.",
    "",
    title,
    `Tutor: ${tutor}`,
    `When: ${when}`,
    `Length: ${length}`,
  ];
  if (meet) lines.push(`Join: ${meet}`);
  lines.push(
    "",
    "You can also find this session in your portal:",
    portal,
    "",
    "— Accepted Admissions",
  );
  const meetHtml = meet
    ? `<br>Join: <a href="${escapeHtml(meet)}" style="color:#1e3448;font-weight:600;">${escapeHtml(meet)}</a>`
    : "";
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(studentBookingConfirmationSubject(tutor))}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f2ed;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your session is confirmed for ${escapeHtml(when)}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ed;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            <tr>
              <td style="background:#1e3448;padding:24px 32px;">
                <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#cfd8e0;font-weight:600;">Accepted Admissions</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#1e3448;">Hi ${escapeHtml(first)},</p>
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#33414f;">Your session is confirmed.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <div style="font-size:16px;line-height:1.45;color:#1e3448;font-weight:600;">${escapeHtml(title)}</div>
                      <div style="margin-top:10px;font-size:14px;line-height:1.6;color:#33414f;">Tutor: ${escapeHtml(tutor)}<br>When: ${escapeHtml(when)}<br>Length: ${escapeHtml(length)}${meetHtml}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 8px 32px;">
                <a href="${escapeHtml(portal)}" style="display:inline-block;background:#1e3448;color:#f6f2e9;text-decoration:none;font-size:16px;font-weight:600;padding:14px 26px;border-radius:8px;">Open your portal</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 32px 32px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#33414f;">&mdash; Accepted Admissions</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return {
    from: verifiedFromAddress(),
    subject: studentBookingConfirmationSubject(tutor),
    text: lines.join("\n"),
    html,
  };
}

export type StudentBookingConfirmationClaimStore = {
  claim: (sessionId: string, paymentId?: string | null) => Promise<string | null>;
  release: (claimId: string) => Promise<void>;
};

async function dbTables() {
  const database = await import("@workspace/db");
  return {
    db: database.db,
    studentBookingConfirmationSendsTable: database.studentBookingConfirmationSendsTable,
    sessionsTable: database.sessionsTable,
    usersTable: database.usersTable,
  };
}

async function claimSendInDatabase(
  sessionId: string,
  paymentId?: string | null,
): Promise<string | null> {
  const { db, studentBookingConfirmationSendsTable } = await dbTables();
  const claimed = await db
    .insert(studentBookingConfirmationSendsTable)
    .values({
      sessionId,
      paymentId: paymentId?.trim() || null,
    })
    .onConflictDoNothing({
      target: [studentBookingConfirmationSendsTable.sessionId],
    })
    .returning({ id: studentBookingConfirmationSendsTable.id });
  return claimed[0]?.id ?? null;
}

async function releaseSendInDatabase(claimId: string): Promise<void> {
  const { db, studentBookingConfirmationSendsTable } = await dbTables();
  await db
    .delete(studentBookingConfirmationSendsTable)
    .where(eq(studentBookingConfirmationSendsTable.id, claimId));
}

const defaultClaimStore: StudentBookingConfirmationClaimStore = {
  claim: claimSendInDatabase,
  release: releaseSendInDatabase,
};

export type StudentBookingConfirmationDetails = {
  studentName: string;
  studentEmail: string;
  sessionTitle: string;
  tutorName: string;
  start: Date;
  clientTimezone: string | null;
  sessionTimezone: string | null;
  durationMinutes: number;
  meetUrl: string | null;
  cancelled: boolean;
};

export async function loadStudentBookingConfirmationDetails(
  sessionId: string,
): Promise<StudentBookingConfirmationDetails | null> {
  const { db, sessionsTable, usersTable } = await dbTables();
  const [session] = await db
    .select({
      title: sessionsTable.title,
      dateTime: sessionsTable.dateTime,
      timezone: sessionsTable.timezone,
      durationMinutes: sessionsTable.durationMinutes,
      meetUrl: sessionsTable.meetUrl,
      providerEventUrl: sessionsTable.providerEventUrl,
      bookingStatus: sessionsTable.bookingStatus,
      cancelledAt: sessionsTable.cancelledAt,
      clientUserId: sessionsTable.clientUserId,
      tutorUserId: sessionsTable.tutorUserId,
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  if (!session) return null;
  const ids = [session.clientUserId, session.tutorUserId].filter(
    (id): id is string => Boolean(id),
  );
  const people =
    ids.length === 0
      ? []
      : await db
          .select({
            id: usersTable.id,
            displayName: usersTable.displayName,
            email: usersTable.email,
            timezone: usersTable.timezone,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, ids));
  const byId = new Map(people.map((row) => [row.id, row]));
  const student = session.clientUserId ? byId.get(session.clientUserId) : undefined;
  const tutor = session.tutorUserId ? byId.get(session.tutorUserId) : undefined;
  return {
    studentName: student?.displayName ?? "",
    studentEmail: student?.email?.trim() ?? "",
    sessionTitle: session.title,
    tutorName: tutor?.displayName ?? "",
    start: session.dateTime,
    clientTimezone: student?.timezone ?? null,
    sessionTimezone: session.timezone,
    durationMinutes: Number(session.durationMinutes),
    meetUrl: resolvedStoredMeetUrl(session.meetUrl, session.providerEventUrl),
    cancelled: isCancelledBooking({
      bookingStatus: session.bookingStatus,
      cancelledAt: session.cancelledAt,
    }),
  };
}

export async function sendStudentBookingConfirmation(
  args: { sessionId: string; paymentId?: string | null; meetUrl?: string | null },
  claimStore: StudentBookingConfirmationClaimStore = defaultClaimStore,
  loadDetails: typeof loadStudentBookingConfirmationDetails = loadStudentBookingConfirmationDetails,
  sendEmail: typeof sendTransactionalEmail = sendTransactionalEmail,
  timeoutMs: number = STUDENT_BOOKING_CONFIRMATION_TIMEOUT_MS,
): Promise<TransactionalEmailResult> {
  const details = await loadDetails(args.sessionId);
  if (!details) {
    return { status: "skipped", reason: "Session not found" };
  }
  if (details.cancelled) {
    return { status: "skipped", reason: "Session is cancelled" };
  }
  const to = details.studentEmail.trim().toLowerCase();
  if (!to) {
    return { status: "skipped", reason: "Student email is missing" };
  }
  const message = studentBookingConfirmationEmail({
    ...details,
    meetUrl: resolvedStoredMeetUrl(details.meetUrl, args.meetUrl),
  });
  const claimed = await claimStore.claim(args.sessionId, args.paymentId);
  if (!claimed) {
    return { status: "skipped", reason: "Confirmation email already sent for this session" };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      sendEmail({
        to,
        from: message.from,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }).finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<TransactionalEmailResult>((resolve) => {
        timer = setTimeout(() => {
          resolve({
            status: "failed",
            error: `Student booking email timed out after ${timeoutMs}ms`,
          });
        }, timeoutMs);
      }),
    ]);
    if (result.status !== "sent") {
      await claimStore.release(claimed);
    }
    return result;
  } catch (error) {
    await claimStore.release(claimed);
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Student booking email failed",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fire-and-forget. Booking responses must not wait on Resend. */
export function queueStudentBookingConfirmation(
  args: { sessionId: string; paymentId?: string | null; meetUrl?: string | null },
  timeoutMs: number = STUDENT_BOOKING_CONFIRMATION_TIMEOUT_MS,
  deps?: {
    claimStore?: StudentBookingConfirmationClaimStore;
    loadDetails?: typeof loadStudentBookingConfirmationDetails;
    sendEmail?: typeof sendTransactionalEmail;
  },
): void {
  void sendStudentBookingConfirmation(
    args,
    deps?.claimStore ?? defaultClaimStore,
    deps?.loadDetails ?? loadStudentBookingConfirmationDetails,
    deps?.sendEmail ?? sendTransactionalEmail,
    timeoutMs,
  )
    .then((result) => {
      if (result.status === "sent") {
        logger.info({
          event: "booking_student_confirmation.sent",
          sessionId: args.sessionId,
          paymentId: args.paymentId ?? null,
          id: result.id,
        });
        return;
      }
      if (result.status === "skipped") {
        logger.info({
          event: "booking_student_confirmation.skipped",
          sessionId: args.sessionId,
          reason: result.reason,
        });
        return;
      }
      logger.warn({
        event: "booking_student_confirmation.failed",
        sessionId: args.sessionId,
        error: result.error,
      });
    })
    .catch((error) => {
      logger.warn({
        event: "booking_student_confirmation.failed",
        sessionId: args.sessionId,
        error: error instanceof Error ? error.message : "Student booking email failed",
      });
    });
}
