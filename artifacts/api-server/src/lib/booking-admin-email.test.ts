import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  ADMIN_INBOX_EMAIL,
  setTransactionalEmailTestTransport,
} from "./transactional-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  bookingAdminAlertEmail,
  meetUrlFromSessionFields,
  queueBookingAdminAlert,
  sendBookingAdminAlert,
} from "./booking-admin-email.ts";

test("booking admin alert emails only admin@ and includes student, tutor, ET time, and Meet", () => {
  const email = bookingAdminAlertEmail({
    title: "SAT booking confirmed",
    message: "Michelle Makarem booked Michelle’s SAT Session with Sophia.",
    studentName: "Michelle Makarem",
    tutorName: "Sophia Lamas",
    start: new Date("2026-11-16T14:00:00.000Z"),
    meetUrl: "https://meet.google.com/ase-tqtz-ywj",
  });
  assert.equal(email.to, ADMIN_INBOX_EMAIL);
  assert.equal(email.subject, "SAT booking confirmed");
  assert.match(email.text, /Student: Michelle Makarem/);
  assert.match(email.text, /Tutor: Sophia Lamas/);
  assert.match(email.text, /Time: Nov 16, 2026, 9:00 AM ET/);
  assert.match(email.text, /Meet: https:\/\/meet\.google\.com\/ase-tqtz-ywj/);
  assert.doesNotMatch(email.text, /makaremmichelle7@gmail\.com/);
  assert.doesNotMatch(String(email.to), /makaremmichelle7|sophia\.e\.lamas|gmail\.com/);
});

test("meet url is taken from a session Meet field or the in-app message, not a calendar HTML link", () => {
  assert.equal(
    meetUrlFromSessionFields("https://www.google.com/calendar/event?eid=abc", "Meet: https://meet.google.com/ase-tqtz-ywj"),
    "https://meet.google.com/ase-tqtz-ywj",
  );
  assert.equal(meetUrlFromSessionFields("https://meet.google.com/ase-tqtz-ywj"), "https://meet.google.com/ase-tqtz-ywj");
});

test("sendBookingAdminAlert uses the test transport and never addresses a client", async () => {
  const sent: Array<{ to: string | string[]; subject: string }> = [];
  setTransactionalEmailTestTransport(async (input) => {
    sent.push({ to: input.to, subject: input.subject });
    return { status: "sent", id: "test-id" };
  });
  try {
    const result = await sendBookingAdminAlert({
      title: "SAT booking cancelled — credit restored",
      message: "Michelle Makarem cancelled Michelle’s SAT Session with Sophia. Credit restored: yes.",
      studentName: "Michelle Makarem",
      tutorName: "Sophia Lamas",
      start: "2026-11-16T14:00:00.000Z",
      meetUrl: "https://meet.google.com/ase-tqtz-ywj",
    });
    assert.equal(result.status, "sent");
    assert.deepEqual(sent, [{ to: ADMIN_INBOX_EMAIL, subject: "SAT booking cancelled — credit restored" }]);
  } finally {
    setTransactionalEmailTestTransport(undefined);
  }
});

test("sendBookingAdminAlert times out instead of hanging the caller", async () => {
  setTransactionalEmailTestTransport(() => new Promise(() => {}));
  try {
    const result = await sendBookingAdminAlert(
      {
        title: "No Google Calendar invite was sent",
        message: "Google Calendar was not updated.",
        studentName: "Michelle Makarem",
        tutorName: "Sophia Lamas",
        start: new Date("2026-11-16T14:00:00.000Z"),
        meetUrl: "https://meet.google.com/ase-tqtz-ywj",
      },
      undefined,
      30,
    );
    assert.equal(result.status, "failed");
    if (result.status === "failed") assert.match(result.error, /timed out/);
  } finally {
    setTransactionalEmailTestTransport(undefined);
  }
});

test("queueBookingAdminAlert returns immediately even if Resend hangs", () => {
  setTransactionalEmailTestTransport(() => new Promise(() => {}));
  try {
    const started = Date.now();
    queueBookingAdminAlert(
      {
        title: "Send calendar invite manually",
        message: "Send the invite by hand.",
        studentName: "Michelle Makarem",
        tutorName: "Sophia Lamas",
        start: new Date("2026-11-16T14:00:00.000Z"),
      },
      30,
    );
    assert.ok(Date.now() - started < 50);
  } finally {
    setTransactionalEmailTestTransport(undefined);
  }
});

test("notifyAdministratorsOfBooking queues a non-blocking admin-only email and keeps the in-app notice", async () => {
  const source = await readFile(new URL("./booking-service.ts", import.meta.url), "utf8");
  assert.match(source, /queueBookingAdminAlert/);
  assert.match(source, /adminNotificationsTable/);
  assert.doesNotMatch(source, /await queueBookingAdminAlert/);
  const email = await readFile(fileURLToPath(new URL("./booking-admin-email.ts", import.meta.url)), "utf8");
  assert.match(email, /to: ADMIN_INBOX_EMAIL/);
  assert.doesNotMatch(email, /to: input\.(student|tutor)/);
});
