import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NEEL_DHARNI_USER_ID } from "./college-consulting.ts";
import {
  clientIntakeAdminNotification,
  emptyIntakeDraft,
  intakeIsBuiltIn,
  intakeStepErrors,
  planIntakeAssignment,
  studentIntakeBody,
  validateClientIntake,
} from "./client-intake.ts";
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";

const today = new Date("2026-10-16T12:00:00.000Z");

function complete(overrides: Record<string, unknown> = {}) {
  return {
    ...emptyIntakeDraft({ name: "Neel Dharni", email: "neel@example.com" }),
    phone: "617-555-0100",
    latestSatScore: "1480",
    latestGpa: "3.85",
    school: "Example School",
    dreamUniversity1: "Harvard",
    dreamUniversity2: "Yale",
    dreamUniversity3: "Princeton",
    targetSafetySchool: "",
    mainFocus: "college_consulting",
    targetSatDate: "",
    ...overrides,
  };
}

test("SAT tutoring asks for the next date and other focuses do not", () => {
  const missingDate = validateClientIntake(
    complete({ mainFocus: "sat_tutoring", targetSatDate: "" }),
    today,
  );
  assert.equal(missingDate.ok, false);
  if (!missingDate.ok) assert.ok(missingDate.errors.targetSatDate);

  const past = validateClientIntake(
    complete({ mainFocus: "sat_tutoring", targetSatDate: "2026-10-15" }),
    today,
  );
  assert.equal(past.ok, false);

  const accepted = validateClientIntake(
    complete({ mainFocus: "sat_tutoring", targetSatDate: "2026-12-05" }),
    today,
  );
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.value.targetSatDate, "2026-12-05");

  const essay = validateClientIntake(
    complete({ mainFocus: "essay_help", targetSatDate: "2026-12-05" }),
    today,
  );
  assert.equal(essay.ok, true);
  if (essay.ok) assert.equal(essay.value.targetSatDate, null);

  const focusErrors = intakeStepErrors(
    "focus",
    complete({ mainFocus: "college_consulting" }),
    today,
  );
  assert.equal(focusErrors.targetSatDate, undefined);
});

test("requires three dream universities and a GPA from 0 to 5.00", () => {
  const dreams = validateClientIntake(complete({ dreamUniversity3: "  " }), today);
  assert.equal(dreams.ok, false);
  const high = validateClientIntake(complete({ latestGpa: "5.01" }), today);
  assert.equal(high.ok, false);
  const top = validateClientIntake(complete({ latestGpa: "5" }), today);
  assert.equal(top.ok, true);
  const score = validateClientIntake(complete({ latestSatScore: "200" }), today);
  assert.equal(score.ok, false);
});

test("student payload hides answers and the admin notice stays in-app", () => {
  const body = studentIntakeBody({
    status: "completed",
    email: "secret@example.com",
    phone: "617-555-0100",
  } as { status: string });
  assert.deepEqual(body, { assigned: true, completed: true });
  assert.deepEqual(Object.keys(body), ["assigned", "completed"]);
  assert.deepEqual(studentIntakeBody(null), { assigned: false, completed: false });
  assert.deepEqual(studentIntakeBody(null, NEEL_DHARNI_USER_ID), {
    assigned: true,
    completed: false,
  });
  assert.deepEqual(studentIntakeBody(null, SOPHIA_SLEIMAN_SAT_USER_ID), {
    assigned: true,
    completed: false,
  });
  assert.equal(intakeIsBuiltIn("00000000-0000-4000-8000-000000000000"), false);
  const note = clientIntakeAdminNotification("Neel Dharni");
  assert.equal(note.kind, "client_intake_submitted");
  assert.equal(note.message, "Neel Dharni submitted the client intake.");
  assert.equal(note.message.includes("@"), false);
});

test("admins can assign any student and repeat assignment is a no-op", () => {
  assert.equal(
    planIntakeAssignment({ client: null, existing: null }).action,
    "missing",
  );
  assert.equal(
    planIntakeAssignment({ client: { id: "t", role: "tutor" }, existing: null }).action,
    "not_student",
  );
  assert.equal(
    planIntakeAssignment({ client: { id: "s", role: "student" }, existing: null }).action,
    "insert",
  );
  assert.equal(
    planIntakeAssignment({
      client: { id: "s", role: "student" },
      existing: { status: "completed" },
    }).action,
    "noop",
  );
});

test("migration is additive and the route does not email or return answers to students", () => {
  const sql = readFileSync(
    new URL("../../../../lib/db/drizzle/0080_client_intake.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "client_intake_assignments"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "client_intake_responses"/);
  assert.equal(/INSERT\s+INTO/i.test(sql), false);
  assert.equal(/recording_consent/i.test(sql), false);
  assert.equal(/UPDATE\s+"users"/i.test(sql), false);
  assert.equal(/clerk/i.test(sql), false);

  const journal = readFileSync(
    new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url),
    "utf8",
  );
  assert.match(journal, /"idx": 80/);
  assert.match(journal, /"tag": "0080_client_intake"/);
  assert.equal(journal.includes("0051_client_intake"), false);

  const route = readFileSync(
    new URL("../routes/client-intake.ts", import.meta.url),
    "utf8",
  );
  assert.equal(/resend|nodemailer|clerkClient|createUser/i.test(route), false);
  assert.equal(/req\.log/.test(route), false);
  assert.equal(/recordingConsent/.test(route), false);
  assert.match(route, /intakeIsBuiltIn/);
  assert.match(route, /clientIntakeAdminNotification/);
  assert.match(route, /studentIntakeBody/);
  const studentGet = route.slice(
    route.indexOf('clientIntakeRouter.get("/me/client-intake"'),
    route.indexOf('clientIntakeRouter.post("/me/client-intake"'),
  );
  assert.equal(studentGet.includes("clientIntakeResponsesTable"), false);
  assert.equal(/insert\(clientIntakeAssignmentsTable\)/.test(studentGet), false);
});
