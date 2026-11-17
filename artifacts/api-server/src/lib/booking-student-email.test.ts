import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { setTransactionalEmailTestTransport, VERIFIED_TRANSACTIONAL_FROM } from "./transactional-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  formatBookingDuration,
  formatBookingWhen,
  firstNameFromDisplayName,
  queueStudentBookingConfirmation,
  resolvedStoredMeetUrl,
  sendStudentBookingConfirmation,
  studentBookingConfirmationEmail,
  studentBookingConfirmationSubject,
  STUDENT_BOOKING_CONFIRMATION_PORTAL_URL,
  type StudentBookingConfirmationClaimStore,
  type StudentBookingConfirmationDetails,
} from "./booking-student-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { checkoutPaymentIntentReceiptFields } from "./checkout-receipt-fields.ts";

const michelleStart = new Date("2026-11-23T14:00:00.000Z");

const michelleInput = {
  studentName: "Michelle Makarem",
  sessionTitle: "Michelle’s SAT Session with Sophia",
  tutorName: "Sophia Lamas",
  start: michelleStart,
  clientTimezone: "Asia/Dubai",
  sessionTimezone: "America/New_York",
  durationMinutes: 60,
  meetUrl: "https://meet.google.com/ase-tqtz-ywj",
};

function memoryClaimStore(): StudentBookingConfirmationClaimStore & { claimed: string[] } {
  const claimed: string[] = [];
  const sessionByClaim = new Map<string, string>();
  const claimsBySession = new Map<string, string>();
  return {
    claimed,
    async claim(sessionId) {
      if (claimsBySession.has(sessionId)) return null;
      const id = `claim-${claimed.length}-${sessionId}`;
      claimsBySession.set(sessionId, id);
      sessionByClaim.set(id, sessionId);
      claimed.push(id);
      return id;
    },
    async release(claimId) {
      const sessionId = sessionByClaim.get(claimId);
      if (!sessionId) return;
      sessionByClaim.delete(claimId);
      claimsBySession.delete(sessionId);
      const index = claimed.indexOf(claimId);
      if (index >= 0) claimed.splice(index, 1);
    },
  };
}

test("first name and duration helpers", () => {
  assert.equal(firstNameFromDisplayName("Michelle Makarem"), "Michelle");
  assert.equal(firstNameFromDisplayName(""), "there");
  assert.equal(formatBookingDuration(60), "1 hour");
  assert.equal(formatBookingDuration(90), "1 hour 30 minutes");
  assert.equal(formatBookingDuration(120), "2 hours");
});

test("when is shown in the student's timezone and ET", () => {
  assert.equal(
    formatBookingWhen(michelleStart, "Asia/Dubai", "America/New_York"),
    "Monday, November 23, 2026 at 6:00 PM GST (9:00 AM ET)",
  );
  assert.equal(
    formatBookingWhen(michelleStart, "America/New_York", "America/New_York"),
    "Monday, November 23, 2026 at 9:00 AM ET",
  );
  assert.equal(
    formatBookingWhen(new Date("2026-11-20T12:00:00.000Z"), "Asia/Tokyo", "America/New_York"),
    "Friday, November 20, 2026 at 9:00 PM JST (7:00 AM ET)",
  );
  assert.equal(
    formatBookingWhen(new Date("2026-11-20T16:00:00.000Z"), "Asia/Tokyo", "America/New_York"),
    "Saturday, November 21, 2026 at 1:00 AM JST (Friday, November 20, 2026 at 11:00 AM ET)",
  );
});

test("student confirmation email is brief, named, and uses the stored Meet link and portal", () => {
  const email = studentBookingConfirmationEmail(michelleInput);
  assert.equal(email.from, VERIFIED_TRANSACTIONAL_FROM);
  assert.equal(email.subject, "Your session with Sophia Lamas is booked");
  assert.match(email.text, /^Hi Michelle,/);
  assert.match(email.text, /Your session is confirmed/);
  assert.match(email.text, /Michelle’s SAT Session with Sophia/);
  assert.match(email.text, /Tutor: Sophia Lamas/);
  assert.match(email.text, /When: Monday, November 23, 2026 at 6:00 PM GST \(9:00 AM ET\)/);
  assert.match(email.text, /Length: 1 hour/);
  assert.match(email.text, /Join: https:\/\/meet\.google\.com\/ase-tqtz-ywj/);
  assert.match(email.text, /https:\/\/app\.acceptedadmissions\.org\/portal/);
  assert.equal(STUDENT_BOOKING_CONFIRMATION_PORTAL_URL, "https://app.acceptedadmissions.org/portal");
  assert.match(email.html, /Open your portal/);
  assert.doesNotMatch(email.text, /admin@acceptedadmissions\.org/);
});

test("Meet links come from stored or resolved rooms only and are never invented", () => {
  assert.equal(resolvedStoredMeetUrl("https://meet.google.com/ase-tqtz-ywj"), "https://meet.google.com/ase-tqtz-ywj");
  assert.equal(
    resolvedStoredMeetUrl("https://www.google.com/calendar/event?eid=abc", "Meet: https://meet.google.com/xqq-zivk-ewx"),
    "https://meet.google.com/xqq-zivk-ewx",
  );
  assert.equal(resolvedStoredMeetUrl("https://www.google.com/calendar/event?eid=abc"), null);
  const email = studentBookingConfirmationEmail({
    ...michelleInput,
    meetUrl: null,
  });
  assert.doesNotMatch(email.text, /meet\.google\.com/);
  assert.doesNotMatch(email.html, /meet\.google\.com/);
});

test("college consulting confirmations use the same student template", () => {
  const email = studentBookingConfirmationEmail({
    studentName: "Neel Shah",
    sessionTitle: "Neel’s College Consulting Session with Nika",
    tutorName: "Nika Raiffe",
    start: new Date("2026-12-02T16:00:00.000Z"),
    clientTimezone: "America/New_York",
    durationMinutes: 90,
    meetUrl: "https://meet.google.com/zzz-consult-xx",
  });
  assert.equal(email.subject, "Your session with Nika Raiffe is booked");
  assert.match(email.text, /Length: 1 hour 30 minutes/);
  assert.match(email.text, /College Consulting/);
});

test("send is idempotent per session and releases the claim when delivery fails", async () => {
  const store = memoryClaimStore();
  const details: StudentBookingConfirmationDetails = {
    ...michelleInput,
    studentEmail: "makaremmichelle7@gmail.com",
    clientTimezone: "Asia/Dubai",
    sessionTimezone: "America/New_York",
    meetUrl: "https://meet.google.com/ase-tqtz-ywj",
    cancelled: false,
  };
  const sent: Array<{ to: string | string[]; subject: string }> = [];
  setTransactionalEmailTestTransport(async (input) => {
    sent.push({ to: input.to, subject: input.subject });
    return { status: "sent", id: `resend-${sent.length}` };
  });
  try {
    const first = await sendStudentBookingConfirmation(
      { sessionId: "session-1", paymentId: "pay-1" },
      store,
      async () => details,
    );
    const second = await sendStudentBookingConfirmation(
      { sessionId: "session-1", paymentId: "pay-1" },
      store,
      async () => details,
    );
    assert.equal(first.status, "sent");
    assert.equal(second.status, "skipped");
    if (second.status === "skipped") assert.match(second.reason, /already sent/);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], {
      to: "makaremmichelle7@gmail.com",
      subject: "Your session with Sophia Lamas is booked",
    });
  } finally {
    setTransactionalEmailTestTransport(undefined);
  }

  const failing = memoryClaimStore();
  setTransactionalEmailTestTransport(async () => ({ status: "failed", error: "Resend down" }));
  try {
    const failed = await sendStudentBookingConfirmation(
      { sessionId: "session-2" },
      failing,
      async () => details,
    );
    assert.equal(failed.status, "failed");
    assert.equal(failing.claimed.length, 0);
    const recovered: string[] = [];
    setTransactionalEmailTestTransport(async (input) => {
      recovered.push(String(input.to));
      return { status: "sent", id: "ok" };
    });
    const retry = await sendStudentBookingConfirmation(
      { sessionId: "session-2" },
      failing,
      async () => details,
    );
    assert.equal(retry.status, "sent");
    assert.deepEqual(recovered, ["makaremmichelle7@gmail.com"]);
  } finally {
    setTransactionalEmailTestTransport(undefined);
  }
});

test("cancelled sessions and missing student emails are skipped without claiming", async () => {
  const store = memoryClaimStore();
  setTransactionalEmailTestTransport(async () => ({ status: "sent", id: "should-not-send" }));
  try {
    const cancelled = await sendStudentBookingConfirmation(
      { sessionId: "cancelled" },
      store,
      async () => ({
        ...michelleInput,
        studentEmail: "makaremmichelle7@gmail.com",
        meetUrl: michelleInput.meetUrl,
        clientTimezone: "Asia/Dubai",
        sessionTimezone: "America/New_York",
        cancelled: true,
      }),
    );
    const missing = await sendStudentBookingConfirmation(
      { sessionId: "missing-email" },
      store,
      async () => ({
        ...michelleInput,
        studentEmail: "",
        meetUrl: michelleInput.meetUrl,
        clientTimezone: "Asia/Dubai",
        sessionTimezone: "America/New_York",
        cancelled: false,
      }),
    );
    assert.equal(cancelled.status, "skipped");
    assert.equal(missing.status, "skipped");
    assert.equal(store.claimed.length, 0);
  } finally {
    setTransactionalEmailTestTransport(undefined);
  }
});

test("queueStudentBookingConfirmation returns immediately even if Resend hangs", () => {
  setTransactionalEmailTestTransport(() => new Promise(() => {}));
  try {
    const started = Date.now();
    queueStudentBookingConfirmation({ sessionId: "session-hang" }, 30, {
      claimStore: memoryClaimStore(),
      loadDetails: async () => ({
        ...michelleInput,
        studentEmail: "makaremmichelle7@gmail.com",
        meetUrl: michelleInput.meetUrl,
        cancelled: false,
      }),
    });
    assert.ok(Date.now() - started < 50);
  } finally {
    setTransactionalEmailTestTransport(undefined);
  }
});

test("booking confirmation path queues a student email without awaiting it, and never backfills", async () => {
  const platform = await readFile(new URL("../routes/platform.ts", import.meta.url), "utf8");
  assert.match(platform, /queueStudentBookingConfirmation\(/);
  assert.doesNotMatch(platform, /await queueStudentBookingConfirmation/);
  assert.match(platform, /confirmBookedSession/);
  // The live payment retry path may queue again, but deploy/startup must not.
  const startup = await readFile(fileURLToPath(new URL("../index.ts", import.meta.url)), "utf8");
  assert.doesNotMatch(startup, /queueStudentBookingConfirmation|studentBookingConfirmationSendsTable/);
  const migration = await readFile(
    fileURLToPath(new URL("../../../../lib/db/drizzle/0090_student_booking_confirmation_sends.sql", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(migration, /\bINSERT\b/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "student_booking_confirmation_sends"/);
});

test("admin booking alerts stay admin-only; student mail is a separate helper", async () => {
  const admin = await readFile(fileURLToPath(new URL("./booking-admin-email.ts", import.meta.url)), "utf8");
  assert.match(admin, /to: ADMIN_INBOX_EMAIL/);
  assert.doesNotMatch(admin, /queueStudentBookingConfirmation/);
  assert.equal(studentBookingConfirmationSubject("Sophia Lamas"), "Your session with Sophia Lamas is booked");
});

test("new Checkout Sessions set payment_intent_data.receipt_email and do not change existing charges", () => {
  const fields = checkoutPaymentIntentReceiptFields({
    paymentId: "pay_1",
    invoiceId: "inv_1",
    productId: "prod_1",
    clientUserId: "user_1",
    receiptEmail: "makaremmichelle7@gmail.com",
  });
  assert.equal(fields["payment_intent_data[receipt_email]"], "makaremmichelle7@gmail.com");
  assert.equal(fields["payment_intent_data[metadata][payment_id]"], "pay_1");
  assert.equal(checkoutPaymentIntentReceiptFields({
    paymentId: "pay_1",
    invoiceId: "inv_1",
    productId: "prod_1",
    clientUserId: "user_1",
    receiptEmail: "  ",
  })["payment_intent_data[receipt_email]"], undefined);
});
