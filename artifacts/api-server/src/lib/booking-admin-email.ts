import {
  ADMIN_INBOX_EMAIL,
  sendTransactionalEmail,
  verifiedFromAddress,
  type TransactionalEmail,
  type TransactionalEmailResult,
} from "./transactional-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { formatSessionInstantEt } from "./admin-calendar-fallback.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { logger } from "./logger.ts";

export const BOOKING_ADMIN_ALERT_TIMEOUT_MS = 5_000;

export type BookingAdminAlertInput = {
  title: string;
  message: string;
  studentName?: string | null;
  tutorName?: string | null;
  start?: Date | string | null;
  meetUrl?: string | null;
};

const MEET_URL_RE = /https:\/\/meet\.google\.com\/[a-z0-9-]+/i;

export function meetUrlFromSessionFields(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const value of candidates) {
    const match = value?.match(MEET_URL_RE);
    if (match) return match[0];
  }
  return null;
}

export function bookingAdminAlertEmail(input: BookingAdminAlertInput): TransactionalEmail {
  const start = input.start
    ? formatSessionInstantEt(input.start instanceof Date ? input.start : new Date(input.start))
    : "Time not available";
  const student = input.studentName?.trim() || "Student not available";
  const tutor = input.tutorName?.trim() || "Tutor not available";
  const meet = meetUrlFromSessionFields(input.meetUrl, input.message) || "Meet link not available";
  const text = [
    input.title,
    "",
    `Student: ${student}`,
    `Tutor: ${tutor}`,
    `Time: ${start}`,
    `Meet: ${meet}`,
    "",
    input.message,
  ].join("\n");
  const html = [
    `<p><strong>${escapeHtml(input.title)}</strong></p>`,
    "<p>",
    `Student: ${escapeHtml(student)}<br>`,
    `Tutor: ${escapeHtml(tutor)}<br>`,
    `Time: ${escapeHtml(start)}<br>`,
    `Meet: ${meet.startsWith("https://") ? `<a href="${escapeHtml(meet)}">${escapeHtml(meet)}</a>` : escapeHtml(meet)}`,
    "</p>",
    `<p>${escapeHtml(input.message)}</p>`,
  ].join("");
  return {
    to: ADMIN_INBOX_EMAIL,
    from: verifiedFromAddress(),
    subject: input.title,
    text,
    html,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendBookingAdminAlert(
  input: BookingAdminAlertInput,
  sendEmail: typeof sendTransactionalEmail = sendTransactionalEmail,
  timeoutMs: number = BOOKING_ADMIN_ALERT_TIMEOUT_MS,
): Promise<TransactionalEmailResult> {
  const message = bookingAdminAlertEmail(input);
  const recipients = Array.isArray(message.to) ? message.to : [message.to];
  if (recipients.some((email) => email.trim().toLowerCase() !== ADMIN_INBOX_EMAIL)) {
    return { status: "failed", error: "Booking alerts may only be sent to the admin inbox" };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sendEmail(message).finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<TransactionalEmailResult>((resolve) => {
        timer = setTimeout(() => {
          resolve({ status: "failed", error: `Admin booking email timed out after ${timeoutMs}ms` });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fire-and-forget. Booking responses must not wait on Resend. */
export function queueBookingAdminAlert(
  input: BookingAdminAlertInput,
  timeoutMs: number = BOOKING_ADMIN_ALERT_TIMEOUT_MS,
): void {
  void sendBookingAdminAlert(input, sendTransactionalEmail, timeoutMs)
    .then((result) => {
      if (result.status === "sent") {
        logger.info({ event: "booking_admin_alert.sent", subject: input.title, id: result.id });
        return;
      }
      if (result.status === "skipped") {
        logger.info({ event: "booking_admin_alert.skipped", subject: input.title, reason: result.reason });
        return;
      }
      logger.warn({ event: "booking_admin_alert.failed", subject: input.title, error: result.error });
    })
    .catch((error) => {
      logger.warn({
        event: "booking_admin_alert.failed",
        subject: input.title,
        error: error instanceof Error ? error.message : "Admin booking email failed",
      });
    });
}
