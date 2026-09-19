import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { ADMIN_INBOX_EMAIL } from "./transactional-email.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  guidanceRequestAdminInbox,
  guidanceRequestEmailSubject,
  guidanceRequestEmailText,
  sendGuidanceRequestAdminEmail,
} from "./guidance-request-email.ts";

const sample = {
  guardianName: "Jordan Parent",
  studentName: "Alex Student",
  email: "jordan.parent@example.invalid",
  phone: "4155551212",
  gradeOrGraduationYear: "11th grade",
  currentSchool: "Lincoln High",
  serviceRequested: "Private SAT tutoring",
  currentSatTotal: "1280",
  currentReadingWriting: "640",
  currentMath: "640",
  targetSatScore: "1450",
  plannedTestDate: "2026-10-03",
  goals: "Raise the math score before October.",
  schedulingAvailability: "Weeknights after 6pm PT",
  referralSource: "School counselor",
  consentToContact: true,
  privacyAcknowledged: true,
  sourcePage: "/client-request",
};

test("guidance inbox helper only accepts the admin address", () => {
  assert.equal(guidanceRequestAdminInbox("ADMIN@acceptedadmissions.org"), ADMIN_INBOX_EMAIL);
  assert.throws(() => guidanceRequestAdminInbox("jordan.parent@example.invalid"), /must go to/);
});

test("guidance email includes the submitted fields and not a student To-line", () => {
  const text = guidanceRequestEmailText(sample);
  assert.match(guidanceRequestEmailSubject(sample), /Alex Student/);
  assert.match(guidanceRequestEmailSubject(sample), /Private SAT tutoring/);
  assert.match(text, /Jordan Parent/);
  assert.match(text, /jordan.parent@example.invalid/);
  assert.match(text, /4155551212/);
  assert.match(text, /Lincoln High/);
  assert.match(text, /Raise the math score/);
  assert.match(text, /Weeknights after 6pm PT/);
  assert.match(text, /School counselor/);
  assert.match(text, /\/client-request/);
  assert.match(text, /admin@acceptedadmissions.org only/);
  assert.doesNotMatch(text, /To: jordan\.parent@example\.invalid/);
});

test("guidance notify is optional and does not fail closed when mail is missing or skipped", async () => {
  const missing = await sendGuidanceRequestAdminEmail(sample, async () => ({
    status: "failed",
    error: "RESEND_API_KEY is not configured",
  }));
  assert.equal(missing.status, "failed");
  if (missing.status === "failed") {
    assert.match(missing.error, /RESEND_API_KEY/);
  }

  const skipped = await sendGuidanceRequestAdminEmail(sample, async () => ({
    status: "skipped",
    reason: "RESEND_API_KEY is not configured",
  }));
  assert.equal(skipped.status, "skipped");
  if (skipped.status === "skipped") {
    assert.match(skipped.reason, /RESEND_API_KEY/);
  }
});

test("guidance notify sends only to the admin inbox through a mock transport", async () => {
  let captured: { to?: string | string[]; replyTo?: string; required?: boolean; text?: string; html?: string } | undefined;
  const result = await sendGuidanceRequestAdminEmail(sample, async (input) => {
    captured = input;
    return { status: "sent", id: "email_guidance_1" };
  });
  assert.deepEqual(result, { status: "sent", id: "email_guidance_1" });
  assert.equal(captured?.to, ADMIN_INBOX_EMAIL);
  assert.equal(captured?.replyTo, sample.email);
  assert.equal(captured?.required, false);
  assert.notEqual(captured?.to, sample.email);
  assert.match(captured?.text ?? "", /Alex Student/);
  assert.match(captured?.html ?? "", /Lincoln High/);
});
