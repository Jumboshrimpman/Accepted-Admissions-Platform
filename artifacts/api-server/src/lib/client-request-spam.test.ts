import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENT_REQUEST_HONEYPOT_FIELD,
  clientRequestSpamVerdict,
  parseClientRequestDate,
} from "./client-request-spam.ts";

const now = new Date("2026-11-04T23:00:00.000Z");

function payload(overrides: Record<string, unknown> = {}) {
  return {
    guardianName: "Jordan Parent",
    studentName: "Alex Student",
    email: "parent@example.invalid",
    phone: "4155551212",
    gradeOrGraduationYear: "11th grade",
    currentSchool: "Lincoln High",
    serviceRequested: "Private SAT tutoring",
    currentSatTotal: "1280",
    goals: "Raise the math score before March.",
    schedulingAvailability: "Weeknights after 6pm PT",
    referralSource: "School counselor",
    consentToContact: true,
    privacyAcknowledged: true,
    ...overrides,
  };
}

test("a normal request passes", () => {
  assert.deepEqual(clientRequestSpamVerdict(payload(), now), { kind: "ok" });
  assert.deepEqual(
    clientRequestSpamVerdict(
      payload({
        plannedTestDate: "2027-03-13",
        gradeOrGraduationYear: "Class of 2028",
        currentSatTotal: "around 1250-1300",
        currentMath: "640",
        currentReadingWriting: "",
        targetSatScore: "1500",
        [CLIENT_REQUEST_HONEYPOT_FIELD]: "",
      }),
      now,
    ),
    { kind: "ok" },
  );
  // A recent past sitting (the existing HTTP test uses one) is still accepted.
  assert.equal(clientRequestSpamVerdict(payload({ plannedTestDate: "2026-10-03" }), now).kind, "ok");
});

test("a filled honeypot is flagged so the route can fake success", () => {
  assert.deepEqual(
    clientRequestSpamVerdict(payload({ [CLIENT_REQUEST_HONEYPOT_FIELD]: "https://spam.example" }), now),
    { kind: "honeypot" },
  );
});

test("nonsense test dates are rejected", () => {
  for (const plannedTestDate of ["1970-01-01", "2024-05-04", "2099-06-01", "2030-02-30", "soon"]) {
    assert.equal(
      clientRequestSpamVerdict(payload({ plannedTestDate }), now).kind,
      "invalid",
      plannedTestDate,
    );
  }
  assert.equal(clientRequestSpamVerdict(payload({ plannedTestDate: "2029-11-01" }), now).kind, "ok");
});

test("impossible scores, years, names, and very long answers are rejected", () => {
  const bad = [
    { currentSatTotal: "2400" },
    { targetSatScore: "99" },
    { currentMath: "900" },
    { gradeOrGraduationYear: "1970" },
    { gradeOrGraduationYear: "Class of 2099" },
    { guardianName: "12345" },
    { studentName: "https://spam.example" },
    { currentSchool: "x".repeat(201) },
    { goals: "x".repeat(5001) },
  ];
  for (const overrides of bad) {
    assert.equal(clientRequestSpamVerdict(payload(overrides), now).kind, "invalid", JSON.stringify(overrides).slice(0, 60));
  }
});

test("parseClientRequestDate accepts real calendar dates only", () => {
  assert.equal(parseClientRequestDate("2027-03-13")?.toISOString(), "2027-03-13T00:00:00.000Z");
  assert.equal(parseClientRequestDate("2027-02-29"), null);
  assert.equal(parseClientRequestDate("03/13/2027"), null);
});
