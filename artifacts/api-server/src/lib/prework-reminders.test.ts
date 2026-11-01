import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  PREWORK_REMINDER_PORTAL_BASE_URL,
  PREWORK_REMINDER_WINDOW_HOURS,
  preworkReminderEmail,
  preworkReminderHtml,
  preworkReminderQuizLabel,
  preworkReminderRecipient,
  resolvePreworkReminderDue,
  shouldSendPreworkReminder,
} from "./prework-reminders.ts";

const ready = {
  role: "student" as const,
  hasStarted: false,
  latestAttemptStatus: null,
  deliveryPhase: "before_session" as const,
  sessionCancelled: false,
  hoursUntilSession: 12,
};

test("only a student with an email is a recipient", () => {
  assert.equal(
    preworkReminderRecipient({ role: "student", email: "  michelle@example.org " }),
    "michelle@example.org",
  );
  assert.equal(preworkReminderRecipient({ role: "viewer", email: "parent@example.org" }), null);
  assert.equal(preworkReminderRecipient({ role: "tutor", email: "tutor@example.org" }), null);
  assert.equal(
    preworkReminderRecipient({ role: "administrator", email: "admin@acceptedadmissions.org" }),
    null,
  );
  assert.equal(preworkReminderRecipient({ role: "student", email: "   " }), null);
  assert.equal(preworkReminderRecipient({ role: "student", email: null }), null);
  assert.equal(preworkReminderRecipient({ role: null, email: "michelle@example.org" }), null);
});

test("the note names the quiz, the session, and the due time in the student's zone", () => {
  const { subject, text } = preworkReminderEmail({
    studentName: "Michelle Makarem",
    assignmentTitle: "Nov 1 Pre-work: Algebra and Functions",
    subject: "SAT",
    sessionDateTime: new Date("2026-11-01T13:00:00.000Z"),
    sessionTimezone: "America/New_York",
    clientTimezone: "America/New_York",
    dueAt: new Date("2026-11-01T13:00:00.000Z"),
    dueSource: "session_start",
    assignmentId: "22222222-2222-4222-8222-222222222222",
    questionCount: 40,
  });
  assert.equal(subject, "Before your session: SAT Nov 1 Pre-work: Algebra and Functions");
  assert.match(text, /^Hi Michelle,/);
  assert.match(text, /Your SAT session is Sunday, November 1, 2026 at 8:00 AM ET/);
  assert.match(text, /SAT Nov 1 Pre-work: Algebra and Functions — 40 questions\./);
  assert.equal(text.match(/40 questions/g)?.length, 1);
  assert.match(text, /due before your session: Sunday, November 1, 2026 at 8:00 AM ET/);
  assert.ok(text.endsWith(
    `Open your pre-work: ${PREWORK_REMINDER_PORTAL_BASE_URL}/portal/assignments/22222222-2222-4222-8222-222222222222`,
  ));
  assert.doesNotMatch(text, /score|Score|admin@|tutor@/i);
});

test("a Tokyo student sees the session start as 9:00 PM JST", () => {
  const due = resolvePreworkReminderDue({
    deliveryPhase: "before_session",
    deadline: null,
    sessionDateTime: "2026-10-02T12:00:00.000Z",
  });
  assert.equal(due?.source, "session_start");
  const { text } = preworkReminderEmail({
    studentName: "Taito Goto",
    assignmentTitle: "Diagnostic",
    subject: "SAT",
    sessionDateTime: "2026-10-02T12:00:00.000Z",
    sessionTimezone: "Asia/Tokyo",
    clientTimezone: "Asia/Tokyo",
    dueAt: due?.at ?? null,
    dueSource: due?.source ?? null,
    assignmentId: "assignment-1",
    questionCount: 1,
  });
  assert.match(text, /Friday, October 2, 2026 at 9:00 PM JST/);
  assert.match(text, /SAT Diagnostic — 1 question\./);
});

test("an earlier assignment deadline is the due time, not the session start", () => {
  const due = resolvePreworkReminderDue({
    deliveryPhase: "before_session",
    deadline: "2026-10-01T15:00:00.000Z",
    sessionDateTime: "2026-10-02T12:00:00.000Z",
  });
  assert.equal(due?.source, "assignment_deadline");
  const { text } = preworkReminderEmail({
    studentName: "Michelle Makarem",
    assignmentTitle: "Diagnostic",
    subject: "SAT",
    sessionDateTime: "2026-10-02T12:00:00.000Z",
    sessionTimezone: "Asia/Tokyo",
    clientTimezone: "Asia/Tokyo",
    dueAt: due?.at ?? null,
    dueSource: due?.source ?? null,
    assignmentId: "assignment-1",
    questionCount: null,
  });
  assert.match(text, /It is due before Friday, October 2, 2026 at 12:00 AM JST/);
  assert.doesNotMatch(text, /questions/);
});

test("the quiz label drops the staff session title and does not repeat a count", () => {
  assert.equal(
    preworkReminderQuizLabel("SAT Math pre-work — Michelle's SAT Session with Xavier", null),
    "SAT Math pre-work",
  );
  assert.equal(
    preworkReminderQuizLabel("SAT pre-work (40 questions) — Michelle's SAT Session with Xavier", 40),
    "SAT pre-work (40 questions)",
  );
  assert.equal(
    preworkReminderQuizLabel("SAT Math pre-work — Michelle's SAT Session with Xavier", 40),
    "SAT Math pre-work — 40 questions",
  );
  assert.equal(preworkReminderQuizLabel("   ", 40), "your pre-work");
  assert.equal(preworkReminderQuizLabel(null, null), "your pre-work");
});

test("a title that strips to nothing identifying keeps the full quiz name", () => {
  const title = "pre-work — Michelle's SAT Session with Xavier";
  const { subject } = preworkReminderEmail({
    studentName: "Michelle Makarem",
    assignmentTitle: title,
    subject: "SAT Math",
    sessionDateTime: new Date("2026-11-01T13:00:00.000Z"),
    sessionTimezone: "America/New_York",
    clientTimezone: "America/New_York",
    dueAt: new Date("2026-11-01T13:00:00.000Z"),
    dueSource: "session_start",
    assignmentId: "assignment-generic",
    questionCount: 40,
  });
  assert.equal(subject, `Before your session: ${title}`);
});

test("the subject is the quiz name, with no client or tutor in it", () => {
  const title = "SAT pre-work (40 questions) — Michelle's SAT Session with Xavier";
  const { subject, text, html } = preworkReminderEmail({
    studentName: "Michelle Makarem",
    assignmentTitle: title,
    subject: "SAT Math",
    sessionDateTime: new Date("2026-11-01T13:00:00.000Z"),
    sessionTimezone: "America/New_York",
    clientTimezone: "America/New_York",
    dueAt: new Date("2026-11-01T13:00:00.000Z"),
    dueSource: "session_start",
    assignmentId: "assignment-michelle",
    questionCount: 40,
  });
  assert.equal(subject, "Before your session: SAT Math pre-work");
  assert.doesNotMatch(subject, /Michelle|Xavier/);
  assert.equal(text.match(/40 questions/g)?.length, 1);
  assert.doesNotMatch(text, /Xavier/);
  const url = `${PREWORK_REMINDER_PORTAL_BASE_URL}/portal/assignments/assignment-michelle`;
  const outsideHref = html.replace(/href="[^"]*"/g, "");
  assert.equal(outsideHref.includes(url), false);
  assert.ok(html.includes(`href="${url}"`));
  assert.match(html, /SAT Math &middot; 40 questions/);
});

test("the html email escapes the student name and quiz label", () => {
  const html = preworkReminderHtml({
    studentName: `Ava<script>&"X"`,
    quizTitle: `Algebra <b> & "q"`,
    subject: `SAT <math> & "s"`,
    sessionLabel: `Sunday <noon> & "t"`,
    dueLabel: `Due <soon> & "d"`,
    questions: 40,
    openUrl: `https://app.acceptedadmissions.org/portal/assignments/a"b`,
  });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<b>"), false);
  assert.equal(html.includes("<math>"), false);
  assert.match(html, /Hi Ava&lt;script&gt;&amp;&quot;X&quot;/);
  assert.match(html, /Algebra &lt;b&gt; &amp; &quot;q&quot;/);
  assert.match(html, /SAT &lt;math&gt; &amp; &quot;s&quot; &middot; 40 questions/);
  assert.ok(html.includes('href="https://app.acceptedadmissions.org/portal/assignments/a&quot;b"'));
  const outsideHref = html.replace(/href="[^"]*"/g, "");
  assert.equal(outsideHref.includes("portal/assignments"), false);
});

test("a student inside the window with untouched before-session work is reminded", () => {
  assert.equal(shouldSendPreworkReminder(ready), true);
  assert.equal(
    shouldSendPreworkReminder({ ...ready, hoursUntilSession: PREWORK_REMINDER_WINDOW_HOURS }),
    true,
  );
  assert.equal(shouldSendPreworkReminder({ ...ready, hoursUntilSession: 0 }), true);
});

test("a started, submitted, or expired attempt is not reminded", () => {
  assert.equal(shouldSendPreworkReminder({ ...ready, hasStarted: true }), false);
  assert.equal(
    shouldSendPreworkReminder({ ...ready, hasStarted: true, latestAttemptStatus: "expired" }),
    false,
  );
  assert.equal(
    shouldSendPreworkReminder({ ...ready, hasStarted: true, latestAttemptStatus: "active" }),
    false,
  );
  assert.equal(
    shouldSendPreworkReminder({ ...ready, latestAttemptStatus: "submitted" }),
    false,
  );
  assert.equal(shouldSendPreworkReminder({ ...ready, latestAttemptStatus: "expired" }), false);
});

test("in-session work, a cancelled session, and anything outside the window are skipped", () => {
  assert.equal(
    shouldSendPreworkReminder({ ...ready, deliveryPhase: "during_session" }),
    false,
  );
  assert.equal(shouldSendPreworkReminder({ ...ready, sessionCancelled: true }), false);
  assert.equal(
    shouldSendPreworkReminder({ ...ready, hoursUntilSession: PREWORK_REMINDER_WINDOW_HOURS + 0.01 }),
    false,
  );
  assert.equal(shouldSendPreworkReminder({ ...ready, hoursUntilSession: -1 }), false);
  assert.equal(shouldSendPreworkReminder({ ...ready, role: "viewer" }), false);
  assert.equal(shouldSendPreworkReminder({ ...ready, role: "tutor" }), false);
  assert.equal(shouldSendPreworkReminder({ ...ready, role: "administrator" }), false);
});
