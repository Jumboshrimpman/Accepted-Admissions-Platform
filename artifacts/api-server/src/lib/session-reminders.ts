/**
 * Copy and send rules for tutoring session reminders (24 hours and 1 hour).
 * Pure: no database and no network. Emails only — no calendar invites and no Clerk.
 *
 * Students come from SESSION_REMINDER_STUDENT_EMAILS when that env var is set,
 * otherwise the built-in allowlist. The tutor on each of those sessions is
 * included. Parent and viewer accounts are not recipients.
 *
 * Sophia Sleiman keeps the reminder behavior shipped in #268: Abu Dhabi time
 * plus ET, the wide 1–24 hour day-before window, and the original sign-off.
 * SESSION_REMINDERS_ENABLED=false turns off every other student and tutor
 * reminder and leaves Sophia's alone.
 */

// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { MICHELLE_MAKAREM_CLERK_USER_ID, MICHELLE_MAKAREM_EMAIL } from "./calendar-pair-attendees.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { firstNameFromDisplayName, formatBookingDuration, formatBookingWhen, resolvedStoredMeetUrl, STUDENT_BOOKING_CONFIRMATION_PORTAL_URL } from "./booking-student-email.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { formatPreworkInstant } from "./prework-reminders.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { SOPHIA_SLEIMAN_EMAIL, studentFacingMeetingUrl, type SessionMeetingInput } from "./session-meeting-url.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { TAITO_STUDENT_EMAIL } from "./session-schedule.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { isAdminInboxEmail, verifiedFromAddress, type TransactionalEmailResult } from "./transactional-email.ts";

/** Initial students. Replace this list by setting SESSION_REMINDER_STUDENT_EMAILS. */
export const DEFAULT_SESSION_REMINDER_STUDENT_EMAILS = [
  TAITO_STUDENT_EMAIL,
  MICHELLE_MAKAREM_EMAIL,
  SOPHIA_SLEIMAN_EMAIL,
] as const;

/** Same id main used for Sophia's reminders. Email match is the other key. */
export const SOPHIA_SLEIMAN_REMINDER_USER_ID = "bf530aa6-faaa-43df-b3cf-140026f3313e";
export const SOPHIA_SLEIMAN_REMINDER_EMAIL = SOPHIA_SLEIMAN_EMAIL;
/** Always show Abu Dhabi time plus ET, even if her stored timezone is wrong. */
export const SOPHIA_SLEIMAN_REMINDER_TIMEZONE = "Asia/Dubai";
export const MICHELLE_MAKAREM_REMINDER_CLERK_USER_ID = MICHELLE_MAKAREM_CLERK_USER_ID;

export const SESSION_REMINDER_INTERVAL_MS = 5 * 60 * 1000;
export const SESSION_REMINDER_ONE_DAY_HOURS = 24;
/** Day-before sends only in the last hour of the 24h horizon. A 5-minute tick lands in this band. */
export const SESSION_REMINDER_DAY_BEFORE_MIN_HOURS = 23;
export const SESSION_REMINDER_ONE_HOUR_HOURS = 1;
export const SESSION_REMINDER_FALLBACK_TIMEZONE = "America/New_York";
export const SESSION_REMINDER_SIGN_OFF_NAME = "Sama";
export const SESSION_REMINDER_SIGN_OFF_SITE = "acceptedadmissions.org";
export const SESSION_REMINDER_LEGACY_SIGN_OFF = "— Accepted Admissions";

export type SessionReminderKind = "1_day" | "1_hour";
export type SessionReminderAudience = "student" | "tutor";

export type SessionReminderPerson = {
  userId: string | null;
  clerkUserId?: string | null;
  email: string | null;
  displayName: string | null;
  timezone: string | null;
  timezoneSource: string | null;
};

export type SessionReminderCandidate = {
  sessionId: string;
  title: string;
  start: Date | string;
  createdAt: Date | string;
  durationMinutes: number;
  cancelled: boolean;
  archived: boolean;
  confirmed: boolean;
  student: SessionReminderPerson;
  tutor: SessionReminderPerson | null;
  /**
   * Active parent/viewer links for this student, such as Ryo for Taito.
   * Ignored. Those accounts are not reminder recipients.
   */
  linkedViewers?: SessionReminderPerson[];
  meeting: SessionMeetingInput;
};

export type SessionReminderEmailInput = {
  recipientName: string;
  studentName: string;
  tutorName: string;
  sessionTitle: string;
  start: Date | string;
  durationMinutes: number;
  meetUrl?: string | null;
  kind: SessionReminderKind;
  audience: SessionReminderAudience;
  timezone?: string | null;
  timezoneSource?: string | null;
  /** Sophia's student email keeps the #268 copy and clock. */
  legacySophia?: boolean;
  now?: Date;
};

export type PlannedSessionReminder = {
  sessionId: string;
  kind: SessionReminderKind;
  audience: SessionReminderAudience;
  recipientUserId: string | null;
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};

const KINDS: SessionReminderKind[] = ["1_day", "1_hour"];

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizeReminderEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

function isValidIanaTimeZone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * A saved zone counts only when the user (or an admin) set it.
 * `timezone_source = default` is the placeholder, so the email says ET.
 */
export function sessionReminderTimezone(input: {
  timezone?: string | null;
  timezoneSource?: string | null;
}): string {
  const source = (input.timezoneSource ?? "default").trim().toLowerCase();
  const zone = (input.timezone ?? "").trim();
  if (source !== "default" && isValidIanaTimeZone(zone)) return zone;
  return SESSION_REMINDER_FALLBACK_TIMEZONE;
}

export function parseSessionReminderAllowlist(raw: string | null | undefined): Set<string> {
  const text = (raw ?? "").trim();
  const source = text.length > 0 ? text : DEFAULT_SESSION_REMINDER_STUDENT_EMAILS.join(",");
  const emails = source
    .split(/[,;\s]+/)
    .map((part) => normalizeReminderEmail(part))
    .filter((part) => part.includes("@"));
  return new Set(emails);
}

export function sessionReminderAllowlistFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  return parseSessionReminderAllowlist(env.SESSION_REMINDER_STUDENT_EMAILS);
}

/**
 * False only for an explicit off switch. Unset means the new reminders run.
 * Sophia Sleiman's student reminders are not gated by this flag.
 */
export function sessionRemindersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.SESSION_REMINDERS_ENABLED ?? "").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no" && raw !== "off";
}

/** Main's Sophia match: user id or email, and not a non-student role. */
export function isSophiaSleimanReminderRecipient(input: {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
}): boolean {
  if (input.role != null && input.role !== "student") return false;
  const id = (input.userId ?? "").trim();
  const email = normalizeReminderEmail(input.email);
  return id === SOPHIA_SLEIMAN_REMINDER_USER_ID || email === SOPHIA_SLEIMAN_REMINDER_EMAIL;
}

/** Michelle matches her Clerk user id or her known email. */
export function isMichelleMakaremReminderStudent(input: {
  email?: string | null;
  clerkUserId?: string | null;
}): boolean {
  if ((input.clerkUserId ?? "").trim() === MICHELLE_MAKAREM_REMINDER_CLERK_USER_ID) return true;
  return normalizeReminderEmail(input.email) === normalizeReminderEmail(MICHELLE_MAKAREM_EMAIL);
}

export function isSessionReminderStudent(
  email: string | null | undefined,
  allowlist?: ReadonlySet<string>,
  identity?: { userId?: string | null; clerkUserId?: string | null },
): boolean {
  if (isSophiaSleimanReminderRecipient({ userId: identity?.userId, email, role: "student" })) {
    return true;
  }
  if (isMichelleMakaremReminderStudent({ email, clerkUserId: identity?.clerkUserId })) return true;
  const normalized = normalizeReminderEmail(email);
  if (!normalized) return false;
  const list = allowlist ?? sessionReminderAllowlistFromEnv();
  return list.has(normalized);
}

export function hoursUntilSession(start: Date | string, now: Date): number {
  const instant = start instanceof Date ? start : new Date(start);
  return (instant.getTime() - now.getTime()) / (60 * 60 * 1000);
}

/** Hours from when the session was created until it starts. */
export function sessionReminderLeadHours(start: Date | string, createdAt: Date | string): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return hoursUntilSession(start, created);
}

/**
 * Sophia's student reminder keeps main's window: more than 1 hour and at most
 * 24 hours for the day-before email, with no created-at gate.
 * Everyone else: the day-before email fires only in (23h, 24h], and only if
 * the session was created at least 24 hours before it starts. The 1-hour
 * reminder is more than 0 and at most 1 hour away.
 * Started, cancelled, archived, and unconfirmed sessions are never sent.
 */
export function shouldSendSessionReminder(input: {
  kind: SessionReminderKind;
  studentEmail?: string | null;
  studentUserId?: string | null;
  studentClerkUserId?: string | null;
  audience?: SessionReminderAudience;
  allowlist?: ReadonlySet<string>;
  remindersEnabled?: boolean;
  sessionCancelled: boolean;
  sessionArchived?: boolean;
  confirmed?: boolean;
  hoursUntilSession: number;
  leadHours: number;
}): boolean {
  const identity = { userId: input.studentUserId, clerkUserId: input.studentClerkUserId };
  if (!isSessionReminderStudent(input.studentEmail, input.allowlist, identity)) return false;
  if (input.sessionCancelled || input.sessionArchived) return false;
  if (input.confirmed === false) return false;
  if (!Number.isFinite(input.hoursUntilSession) || input.hoursUntilSession <= 0) return false;
  const legacySophia =
    (input.audience ?? "student") === "student" &&
    isSophiaSleimanReminderRecipient({
      userId: input.studentUserId,
      email: input.studentEmail,
      role: "student",
    });
  if (!legacySophia && input.remindersEnabled === false) return false;
  if (input.kind === "1_hour") {
    return input.hoursUntilSession <= SESSION_REMINDER_ONE_HOUR_HOURS;
  }
  if (legacySophia) {
    return (
      input.hoursUntilSession <= SESSION_REMINDER_ONE_DAY_HOURS &&
      input.hoursUntilSession > SESSION_REMINDER_ONE_HOUR_HOURS
    );
  }
  if (!Number.isFinite(input.leadHours) || input.leadHours < SESSION_REMINDER_ONE_DAY_HOURS) {
    return false;
  }
  return (
    input.hoursUntilSession <= SESSION_REMINDER_ONE_DAY_HOURS &&
    input.hoursUntilSession > SESSION_REMINDER_DAY_BEFORE_MIN_HOURS
  );
}

function calendarDayKey(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function nextCalendarDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** "today" or "tomorrow" in the displayed zone, or null when the session is further out. */
export function sessionReminderDayWord(
  start: Date | string,
  now: Date,
  timezone: string,
): "today" | "tomorrow" | null {
  const instant = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(instant.getTime()) || Number.isNaN(now.getTime())) return null;
  const startDay = calendarDayKey(instant, timezone);
  const today = calendarDayKey(now, timezone);
  if (startDay === today) return "today";
  if (startDay === nextCalendarDayKey(today)) return "tomorrow";
  return null;
}

function clockLabel(instant: Date, timezone: string): string {
  const full = formatPreworkInstant(instant, timezone);
  const at = full.indexOf(" at ");
  return at >= 0 ? full.slice(at + 4) : full;
}

export function sessionReminderSubject(input: {
  kind: SessionReminderKind;
  audience: SessionReminderAudience;
  tutorName: string;
  studentName: string;
  legacySophia?: boolean;
  dayWord?: "today" | "tomorrow" | null;
  clock?: string | null;
}): string {
  const tutor = cleanText(input.tutorName) || "your tutor";
  const student = cleanText(input.studentName) || "your student";
  const counterpart = input.audience === "tutor" ? student : tutor;
  if (input.kind === "1_hour" || input.legacySophia) {
    const when = input.kind === "1_hour" ? "starts in 1 hour" : "is tomorrow";
    return `Reminder: your session with ${counterpart} ${when}`;
  }
  if (input.dayWord && input.clock) {
    return `Reminder: your session with ${counterpart} is ${input.dayWord} at ${input.clock}`;
  }
  return `Reminder: your session with ${counterpart} is coming up`;
}

function reminderLead(input: {
  kind: SessionReminderKind;
  audience: SessionReminderAudience;
  student: string;
  legacySophia?: boolean;
  dayWord?: "today" | "tomorrow" | null;
  clock?: string | null;
}): string {
  if (input.legacySophia || input.kind === "1_hour") {
    if (input.audience === "tutor") {
      return input.kind === "1_hour"
        ? `This is a reminder that your session with ${input.student} starts in 1 hour.`
        : `This is a reminder that your session with ${input.student} is tomorrow.`;
    }
    return input.kind === "1_hour"
      ? "This is a reminder that your session starts in 1 hour."
      : "This is a reminder that your session is tomorrow.";
  }
  const when = input.dayWord && input.clock ? `${input.dayWord} at ${input.clock}` : null;
  if (input.audience === "tutor") {
    return when
      ? `This is a reminder that your session with ${input.student} is ${when}.`
      : `This is a reminder that your session with ${input.student} is coming up.`;
  }
  return when
    ? `This is a reminder that your session is ${when}.`
    : "This is a reminder that your session is coming up.";
}

export function sessionReminderEmail(input: SessionReminderEmailInput): {
  from: string;
  subject: string;
  text: string;
  html: string;
} {
  const recipient = firstNameFromDisplayName(input.recipientName);
  const student = cleanText(input.studentName) || "your student";
  const tutor = cleanText(input.tutorName) || "your tutor";
  const title = cleanText(input.sessionTitle) || "your session";
  const legacySophia = input.legacySophia === true;
  const timezone = legacySophia
    ? SOPHIA_SLEIMAN_REMINDER_TIMEZONE
    : sessionReminderTimezone({
        timezone: input.timezone,
        timezoneSource: input.timezoneSource,
      });
  const instant = input.start instanceof Date ? input.start : new Date(input.start);
  const when = Number.isNaN(instant.getTime())
    ? "Time not available"
    : legacySophia
      ? formatBookingWhen(instant, SOPHIA_SLEIMAN_REMINDER_TIMEZONE, "America/New_York")
      : formatPreworkInstant(instant, timezone);
  const dayWord =
    !legacySophia && input.kind === "1_day" && input.now && !Number.isNaN(instant.getTime())
      ? sessionReminderDayWord(instant, input.now, timezone)
      : null;
  const clock =
    !legacySophia && !Number.isNaN(instant.getTime()) ? clockLabel(instant, timezone) : null;
  const length = formatBookingDuration(input.durationMinutes);
  const meet = resolvedStoredMeetUrl(input.meetUrl);
  const portal = STUDENT_BOOKING_CONFIRMATION_PORTAL_URL;
  const joinUrl = meet ?? portal;
  const lead = reminderLead({
    kind: input.kind,
    audience: input.audience,
    student,
    legacySophia,
    dayWord,
    clock,
  });
  const lines = [`Hi ${recipient},`, "", lead, "", title, `Tutor: ${tutor}`];
  if (!legacySophia) lines.push(`Student: ${student}`);
  lines.push(`When: ${when}`, `Length: ${length}`);
  if (meet) lines.push(`Join: ${meet}`);
  else if (!legacySophia) lines.push(`Join: ${portal}`);
  if (meet || legacySophia) {
    lines.push("", "You can also find this session in your portal:", portal);
  }
  if (legacySophia) lines.push("", SESSION_REMINDER_LEGACY_SIGN_OFF);
  else lines.push("", SESSION_REMINDER_SIGN_OFF_NAME, SESSION_REMINDER_SIGN_OFF_SITE);
  const joinTarget = legacySophia ? meet : joinUrl;
  const joinHtml = joinTarget
    ? `<br>Join: <a href="${escapeHtml(joinTarget)}" style="color:#1e3448;font-weight:600;">${escapeHtml(joinTarget)}</a>`
    : "";
  const studentHtml = legacySophia ? "" : `<br>Student: ${escapeHtml(student)}`;
  const portalHtml =
    meet || legacySophia
      ? `<p style="margin:18px 0 0 0;font-size:15px;line-height:1.6;color:#33414f;">You can also find this session in your portal.</p>`
      : "";
  const subject = sessionReminderSubject({
    kind: input.kind,
    audience: input.audience,
    tutorName: tutor,
    studentName: student,
    legacySophia,
    dayWord,
    clock,
  });
  const signOffHtml = legacySophia
    ? `<p style="margin:0;font-size:15px;line-height:1.6;color:#33414f;">&mdash; Accepted Admissions</p>`
    : `<p style="margin:0;font-size:15px;line-height:1.6;color:#33414f;">${escapeHtml(SESSION_REMINDER_SIGN_OFF_NAME)}</p>
                <p style="margin:4px 0 0 0;font-size:13px;line-height:1.6;color:#5c6b78;">${escapeHtml(SESSION_REMINDER_SIGN_OFF_SITE)}</p>`;
  const buttonLabel = meet || legacySophia ? "Open your portal" : "Join from your portal";
  const buttonHref = meet || legacySophia ? portal : joinUrl;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f2ed;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(lead)} ${escapeHtml(when)}.</div>
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
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#1e3448;">Hi ${escapeHtml(recipient)},</p>
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#33414f;">${escapeHtml(lead)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;border-radius:12px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <div style="font-size:16px;line-height:1.45;color:#1e3448;font-weight:600;">${escapeHtml(title)}</div>
                      <div style="margin-top:10px;font-size:14px;line-height:1.6;color:#33414f;">Tutor: ${escapeHtml(tutor)}${studentHtml}<br>When: ${escapeHtml(when)}<br>Length: ${escapeHtml(length)}${joinHtml}</div>
                      ${portalHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 8px 32px;">
                <a href="${escapeHtml(buttonHref)}" style="display:inline-block;background:#1e3448;color:#f6f2e9;text-decoration:none;font-size:16px;font-weight:600;padding:14px 26px;border-radius:8px;">${buttonLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 32px 32px;">
                ${signOffHtml}
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
    subject,
    text: lines.join("\n"),
    html,
  };
}

export function sessionReminderClaimKey(input: {
  sessionId: string;
  to: string;
  kind: string;
}): string {
  return `${input.sessionId}:${normalizeReminderEmail(input.to)}:${input.kind}`;
}

function reminderRecipients(session: SessionReminderCandidate): Array<{
  audience: SessionReminderAudience;
  person: SessionReminderPerson;
}> {
  const seen = new Set<string>();
  const recipients: Array<{ audience: SessionReminderAudience; person: SessionReminderPerson }> = [];
  const push = (audience: SessionReminderAudience, person: SessionReminderPerson | null) => {
    if (!person) return;
    const email = normalizeReminderEmail(person.email);
    if (!email.includes("@") || seen.has(email) || isAdminInboxEmail(email)) return;
    seen.add(email);
    recipients.push({ audience, person: { ...person, email } });
  };
  push("student", session.student);
  push("tutor", session.tutor);
  // linkedViewers (parent mirrors such as Ryo) are not recipients.
  void session.linkedViewers;
  return recipients;
}

/** One row per session, recipient, and kind that should go out at `now`. */
export function planSessionReminders(input: {
  now: Date;
  allowlist?: ReadonlySet<string>;
  remindersEnabled?: boolean;
  sessions: readonly SessionReminderCandidate[];
}): PlannedSessionReminder[] {
  const allowlist = input.allowlist ?? sessionReminderAllowlistFromEnv();
  const remindersEnabled = input.remindersEnabled ?? sessionRemindersEnabled();
  const planned: PlannedSessionReminder[] = [];
  for (const session of input.sessions) {
    const hours = hoursUntilSession(session.start, input.now);
    const leadHours = sessionReminderLeadHours(session.start, session.createdAt);
    const joinUrl = studentFacingMeetingUrl(session.meeting);
    const recipients = reminderRecipients(session);
    for (const kind of KINDS) {
      for (const recipient of recipients) {
        const legacySophia =
          recipient.audience === "student" &&
          isSophiaSleimanReminderRecipient({
            userId: session.student.userId,
            email: session.student.email,
            role: "student",
          });
        const eligible = shouldSendSessionReminder({
          kind,
          studentEmail: session.student.email,
          studentUserId: session.student.userId,
          studentClerkUserId: session.student.clerkUserId,
          audience: recipient.audience,
          allowlist,
          remindersEnabled,
          sessionCancelled: session.cancelled,
          sessionArchived: session.archived,
          confirmed: session.confirmed,
          hoursUntilSession: hours,
          leadHours,
        });
        if (!eligible) continue;
        const email = sessionReminderEmail({
          recipientName: recipient.person.displayName ?? "",
          studentName: session.student.displayName ?? "",
          tutorName: session.tutor?.displayName ?? "",
          sessionTitle: session.title,
          start: session.start,
          durationMinutes: session.durationMinutes,
          meetUrl: joinUrl,
          kind,
          audience: recipient.audience,
          timezone: legacySophia ? SOPHIA_SLEIMAN_REMINDER_TIMEZONE : recipient.person.timezone,
          timezoneSource: legacySophia ? "admin" : recipient.person.timezoneSource,
          legacySophia,
          now: input.now,
        });
        planned.push({
          sessionId: session.sessionId,
          kind,
          audience: recipient.audience,
          recipientUserId: recipient.person.userId,
          to: recipient.person.email ?? "",
          from: email.from,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }
    }
  }
  return planned;
}

export type DayBeforePreclaim = {
  sessionId: string;
  recipientUserId: string | null;
  recipientEmail: string;
  audience: SessionReminderAudience;
  kind: "1_day";
};

/**
 * One-shot deploy claims for the day-before email. Sessions already inside the
 * next 24 hours are claimed so the first tick cannot send a stale day-before
 * note. Sophia's own student reminder is not claimed; she keeps the wide window.
 * Do not run this on later restarts — that would suppress on-time sends.
 */
export function dayBeforePreclaims(input: {
  now: Date;
  allowlist?: ReadonlySet<string>;
  sessions: readonly SessionReminderCandidate[];
}): DayBeforePreclaim[] {
  const allowlist = input.allowlist ?? sessionReminderAllowlistFromEnv();
  const claims: DayBeforePreclaim[] = [];
  const seen = new Set<string>();
  for (const session of input.sessions) {
    if (session.cancelled || session.archived || !session.confirmed) continue;
    const hours = hoursUntilSession(session.start, input.now);
    if (!Number.isFinite(hours) || hours <= 0 || hours > SESSION_REMINDER_ONE_DAY_HOURS) continue;
    if (
      !isSessionReminderStudent(session.student.email, allowlist, {
        userId: session.student.userId,
        clerkUserId: session.student.clerkUserId,
      })
    ) {
      continue;
    }
    for (const recipient of reminderRecipients(session)) {
      const sophiaStudent =
        recipient.audience === "student" &&
        isSophiaSleimanReminderRecipient({
          userId: session.student.userId,
          email: session.student.email,
          role: "student",
        });
      if (sophiaStudent) continue;
      const email = normalizeReminderEmail(recipient.person.email);
      const key = sessionReminderClaimKey({ sessionId: session.sessionId, to: email, kind: "1_day" });
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push({
        sessionId: session.sessionId,
        recipientUserId: recipient.person.userId,
        recipientEmail: email,
        audience: recipient.audience,
        kind: "1_day",
      });
    }
  }
  return claims;
}

/**
 * Claim each planned reminder, then send. A claim that already exists is not
 * sent again. A failed or skipped send releases the claim so a later run can retry.
 */
export async function deliverSessionReminders(input: {
  planned: readonly PlannedSessionReminder[];
  dryRun?: boolean;
  alreadySentKeys?: ReadonlySet<string>;
  claim: (item: PlannedSessionReminder) => Promise<string | null>;
  release: (claimId: string) => Promise<void>;
  send: (item: PlannedSessionReminder) => Promise<TransactionalEmailResult>;
}): Promise<{
  considered: number;
  sent: number;
  alreadySent: number;
  skipped: number;
  failed: number;
}> {
  const result = { considered: 0, sent: 0, alreadySent: 0, skipped: 0, failed: 0 };
  const seen = new Set<string>();
  for (const item of input.planned) {
    const key = sessionReminderClaimKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.considered += 1;
    if (input.alreadySentKeys?.has(key)) {
      result.alreadySent += 1;
      continue;
    }
    if (input.dryRun) continue;
    const claimId = await input.claim(item);
    if (!claimId) {
      result.alreadySent += 1;
      continue;
    }
    const delivery = await input.send(item);
    if (delivery.status === "sent") {
      result.sent += 1;
      continue;
    }
    await input.release(claimId);
    if (delivery.status === "skipped") result.skipped += 1;
    else result.failed += 1;
  }
  return result;
}

export function startSessionReminderTick(options: {
  run: () => Promise<unknown>;
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  runOnStart?: boolean;
}): { stop: () => void } {
  const intervalMs = options.intervalMs ?? SESSION_REMINDER_INTERVAL_MS;
  const schedule = options.setIntervalFn ?? setInterval;
  const clear = options.clearIntervalFn ?? clearInterval;
  if (options.runOnStart !== false) void options.run();
  const handle = schedule(() => {
    void options.run();
  }, intervalMs);
  return {
    stop: () => clear(handle as ReturnType<typeof setInterval>),
  };
}
