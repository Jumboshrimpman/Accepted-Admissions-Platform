/**
 * Copy and send rules for tutoring session reminders (24 hours and 1 hour).
 * Pure: no database and no network. Emails only — no calendar invites and no Clerk.
 *
 * Students come from SESSION_REMINDER_STUDENT_EMAILS when that env var is set,
 * otherwise the built-in allowlist. The tutor on each of those sessions is
 * included. Parent and viewer accounts are not recipients.
 */

// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { MICHELLE_MAKAREM_EMAIL } from "./calendar-pair-attendees.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { firstNameFromDisplayName, formatBookingDuration, resolvedStoredMeetUrl, STUDENT_BOOKING_CONFIRMATION_PORTAL_URL } from "./booking-student-email.ts";
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

export const SESSION_REMINDER_INTERVAL_MS = 5 * 60 * 1000;
export const SESSION_REMINDER_ONE_DAY_HOURS = 24;
export const SESSION_REMINDER_ONE_HOUR_HOURS = 1;
export const SESSION_REMINDER_FALLBACK_TIMEZONE = "America/New_York";
export const SESSION_REMINDER_SIGN_OFF_NAME = "Sama";
export const SESSION_REMINDER_SIGN_OFF_SITE = "acceptedadmissions.org";

export type SessionReminderKind = "1_day" | "1_hour";
export type SessionReminderAudience = "student" | "tutor";

export type SessionReminderPerson = {
  userId: string | null;
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

export function isSessionReminderStudent(
  email: string | null | undefined,
  allowlist?: ReadonlySet<string>,
): boolean {
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
 * 1-day: the session existed at least 24 hours before it starts, and it is
 * now more than 1 hour and at most 24 hours away.
 * 1-hour: more than 0 and at most 1 hour away.
 * A session booked inside the last 24 hours gets only the 1-hour reminder.
 * Started, cancelled, archived, and unconfirmed sessions are never sent.
 */
export function shouldSendSessionReminder(input: {
  kind: SessionReminderKind;
  studentEmail?: string | null;
  allowlist?: ReadonlySet<string>;
  sessionCancelled: boolean;
  sessionArchived?: boolean;
  confirmed?: boolean;
  hoursUntilSession: number;
  leadHours: number;
}): boolean {
  if (!isSessionReminderStudent(input.studentEmail, input.allowlist)) return false;
  if (input.sessionCancelled || input.sessionArchived) return false;
  if (input.confirmed === false) return false;
  if (!Number.isFinite(input.hoursUntilSession) || input.hoursUntilSession <= 0) return false;
  if (input.kind === "1_hour") {
    return input.hoursUntilSession <= SESSION_REMINDER_ONE_HOUR_HOURS;
  }
  if (!Number.isFinite(input.leadHours) || input.leadHours < SESSION_REMINDER_ONE_DAY_HOURS) {
    return false;
  }
  return (
    input.hoursUntilSession <= SESSION_REMINDER_ONE_DAY_HOURS &&
    input.hoursUntilSession > SESSION_REMINDER_ONE_HOUR_HOURS
  );
}

export function sessionReminderSubject(input: {
  kind: SessionReminderKind;
  audience: SessionReminderAudience;
  tutorName: string;
  studentName: string;
}): string {
  const tutor = cleanText(input.tutorName) || "your tutor";
  const student = cleanText(input.studentName) || "your student";
  const when = input.kind === "1_hour" ? "starts in 1 hour" : "is tomorrow";
  if (input.audience === "tutor") return `Reminder: your session with ${student} ${when}`;
  return `Reminder: your session with ${tutor} ${when}`;
}

function reminderLead(input: SessionReminderEmailInput, student: string): string {
  if (input.audience === "tutor") {
    return input.kind === "1_hour"
      ? `This is a reminder that your session with ${student} starts in 1 hour.`
      : `This is a reminder that your session with ${student} is tomorrow.`;
  }
  return input.kind === "1_hour"
    ? "This is a reminder that your session starts in 1 hour."
    : "This is a reminder that your session is tomorrow.";
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
  const timezone = sessionReminderTimezone({
    timezone: input.timezone,
    timezoneSource: input.timezoneSource,
  });
  const instant = input.start instanceof Date ? input.start : new Date(input.start);
  const when = Number.isNaN(instant.getTime())
    ? "Time not available"
    : formatPreworkInstant(instant, timezone);
  const length = formatBookingDuration(input.durationMinutes);
  const meet = resolvedStoredMeetUrl(input.meetUrl);
  const portal = STUDENT_BOOKING_CONFIRMATION_PORTAL_URL;
  const joinUrl = meet ?? portal;
  const lead = reminderLead(input, student);
  const lines = [
    `Hi ${recipient},`,
    "",
    lead,
    "",
    title,
    `Tutor: ${tutor}`,
    `Student: ${student}`,
    `When: ${when}`,
    `Length: ${length}`,
    `Join: ${joinUrl}`,
  ];
  if (meet) {
    lines.push("", "You can also find this session in your portal:", portal);
  }
  lines.push("", SESSION_REMINDER_SIGN_OFF_NAME, SESSION_REMINDER_SIGN_OFF_SITE);
  const joinHtml = `<br>Join: <a href="${escapeHtml(joinUrl)}" style="color:#1e3448;font-weight:600;">${escapeHtml(joinUrl)}</a>`;
  const portalHtml = meet
    ? `<p style="margin:18px 0 0 0;font-size:15px;line-height:1.6;color:#33414f;">You can also find this session in your portal.</p>`
    : "";
  const subject = sessionReminderSubject({
    kind: input.kind,
    audience: input.audience,
    tutorName: tutor,
    studentName: student,
  });
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
                      <div style="margin-top:10px;font-size:14px;line-height:1.6;color:#33414f;">Tutor: ${escapeHtml(tutor)}<br>Student: ${escapeHtml(student)}<br>When: ${escapeHtml(when)}<br>Length: ${escapeHtml(length)}${joinHtml}</div>
                      ${portalHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 8px 32px;">
                <a href="${escapeHtml(meet ? portal : joinUrl)}" style="display:inline-block;background:#1e3448;color:#f6f2e9;text-decoration:none;font-size:16px;font-weight:600;padding:14px 26px;border-radius:8px;">${meet ? "Open your portal" : "Join from your portal"}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 32px 32px;">
                <p style="margin:0;font-size:15px;line-height:1.6;color:#33414f;">${escapeHtml(SESSION_REMINDER_SIGN_OFF_NAME)}</p>
                <p style="margin:4px 0 0 0;font-size:13px;line-height:1.6;color:#5c6b78;">${escapeHtml(SESSION_REMINDER_SIGN_OFF_SITE)}</p>
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
  sessions: readonly SessionReminderCandidate[];
}): PlannedSessionReminder[] {
  const allowlist = input.allowlist ?? sessionReminderAllowlistFromEnv();
  const planned: PlannedSessionReminder[] = [];
  for (const session of input.sessions) {
    const hours = hoursUntilSession(session.start, input.now);
    const leadHours = sessionReminderLeadHours(session.start, session.createdAt);
    const joinUrl = studentFacingMeetingUrl(session.meeting);
    const recipients = reminderRecipients(session);
    for (const kind of KINDS) {
      const eligible = shouldSendSessionReminder({
        kind,
        studentEmail: session.student.email,
        allowlist,
        sessionCancelled: session.cancelled,
        sessionArchived: session.archived,
        confirmed: session.confirmed,
        hoursUntilSession: hours,
        leadHours,
      });
      if (!eligible) continue;
      for (const recipient of recipients) {
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
          timezone: recipient.person.timezone,
          timezoneSource: recipient.person.timezoneSource,
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
