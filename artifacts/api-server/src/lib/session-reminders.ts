/**
 * Copy and send rules for Sophia Sleiman session reminders (1 day and 1 hour).
 * Pure: no database and no network. Emails only — no calendar invites.
 */

// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import {
  firstNameFromDisplayName,
  formatBookingDuration,
  formatBookingWhen,
  resolvedStoredMeetUrl,
  STUDENT_BOOKING_CONFIRMATION_PORTAL_URL,
} from "./booking-student-email.ts";
// @ts-expect-error Node's strip-types runner resolves the source extension directly.
import { verifiedFromAddress } from "./transactional-email.ts";

export const SOPHIA_SLEIMAN_REMINDER_USER_ID = "bf530aa6-faaa-43df-b3cf-140026f3313e";
export const SOPHIA_SLEIMAN_REMINDER_EMAIL = "sophiasleiman13@gmail.com";
/** Always show Abu Dhabi time plus ET, even if her stored timezone is wrong. */
export const SOPHIA_SLEIMAN_REMINDER_TIMEZONE = "Asia/Dubai";

export const SESSION_REMINDER_INTERVAL_MS = 5 * 60 * 1000;
export const SESSION_REMINDER_ONE_DAY_HOURS = 24;
export const SESSION_REMINDER_ONE_HOUR_HOURS = 1;

export type SessionReminderKind = "1_day" | "1_hour";

export type SessionReminderEmailInput = {
  studentName: string;
  sessionTitle: string;
  tutorName: string;
  start: Date | string;
  durationMinutes: number;
  meetUrl?: string | null;
  kind: SessionReminderKind;
};

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

export function hoursUntilSession(start: Date | string, now: Date): number {
  const instant = start instanceof Date ? start : new Date(start);
  return (instant.getTime() - now.getTime()) / (60 * 60 * 1000);
}

/**
 * 1-day: more than 1 hour and at most 24 hours away.
 * 1-hour: more than 0 and at most 1 hour away.
 * Sessions that have started, or are cancelled, are never sent.
 */
export function shouldSendSessionReminder(input: {
  kind: SessionReminderKind;
  userId?: string | null;
  email?: string | null;
  role?: string | null;
  sessionCancelled: boolean;
  hoursUntilSession: number;
}): boolean {
  if (!isSophiaSleimanReminderRecipient(input)) return false;
  if (input.sessionCancelled) return false;
  if (!Number.isFinite(input.hoursUntilSession) || input.hoursUntilSession <= 0) return false;
  if (input.kind === "1_hour") {
    return input.hoursUntilSession <= SESSION_REMINDER_ONE_HOUR_HOURS;
  }
  return (
    input.hoursUntilSession <= SESSION_REMINDER_ONE_DAY_HOURS &&
    input.hoursUntilSession > SESSION_REMINDER_ONE_HOUR_HOURS
  );
}

export function sessionReminderSubject(kind: SessionReminderKind, tutorName: string): string {
  const tutor = cleanText(tutorName) || "your tutor";
  return kind === "1_hour"
    ? `Reminder: your session with ${tutor} starts in 1 hour`
    : `Reminder: your session with ${tutor} is tomorrow`;
}

export function sessionReminderEmail(input: SessionReminderEmailInput): {
  from: string;
  subject: string;
  text: string;
  html: string;
} {
  const first = firstNameFromDisplayName(input.studentName);
  const title = cleanText(input.sessionTitle) || "your session";
  const tutor = cleanText(input.tutorName) || "your tutor";
  const when = formatBookingWhen(input.start, SOPHIA_SLEIMAN_REMINDER_TIMEZONE, "America/New_York");
  const length = formatBookingDuration(input.durationMinutes);
  const meet = resolvedStoredMeetUrl(input.meetUrl);
  const portal = STUDENT_BOOKING_CONFIRMATION_PORTAL_URL;
  const lead =
    input.kind === "1_hour"
      ? "This is a reminder that your session starts in 1 hour."
      : "This is a reminder that your session is tomorrow.";
  const lines = [
    `Hi ${first},`,
    "",
    lead,
    "",
    title,
    `Tutor: ${tutor}`,
    `When: ${when}`,
    `Length: ${length}`,
  ];
  if (meet) lines.push(`Join: ${meet}`);
  lines.push("", "You can also find this session in your portal:", portal, "", "— Accepted Admissions");
  const meetHtml = meet
    ? `<br>Join: <a href="${escapeHtml(meet)}" style="color:#1e3448;font-weight:600;">${escapeHtml(meet)}</a>`
    : "";
  const subject = sessionReminderSubject(input.kind, tutor);
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
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#1e3448;">Hi ${escapeHtml(first)},</p>
                <p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:#33414f;">${escapeHtml(lead)}</p>
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
    subject,
    text: lines.join("\n"),
    html,
  };
}

export function startSophiaSessionReminderTick(options: {
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
