import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CLIENT_REQUEST_HONEYPOT_FIELD,
  CLIENT_REQUEST_LONG_FIELD_MAX,
  CLIENT_REQUEST_SHORT_FIELD_MAX,
  clientRequestSpamVerdict,
  clientRequestTestDateBounds,
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

test("free-text score answers are accepted; only bare out-of-range numbers fail", () => {
  for (const answer of ["1350 (Oct 2025)", "1st try 1150", "650 on 3/8", "ACT 31", "PSAT 160"]) {
    for (const field of ["currentSatTotal", "currentReadingWriting", "currentMath", "targetSatScore"]) {
      assert.equal(
        clientRequestSpamVerdict(payload({ [field]: answer }), now).kind,
        "ok",
        `${field}: ${answer}`,
      );
    }
  }
  for (const answer of ["99999", "50"]) {
    for (const field of ["currentSatTotal", "currentReadingWriting", "currentMath", "targetSatScore"]) {
      assert.equal(
        clientRequestSpamVerdict(payload({ [field]: answer }), now).kind,
        "invalid",
        `${field}: ${answer}`,
      );
    }
  }
  assert.equal(clientRequestSpamVerdict(payload({ currentSatTotal: " 1350 " }), now).kind, "ok");
  assert.equal(clientRequestSpamVerdict(payload({ currentMath: "650" }), now).kind, "ok");
});

test("the form's earliest and latest allowed test dates pass; one day outside fails", () => {
  // Late in the day UTC, where a minute-precise comparison used to reject the min date.
  for (const at of [now, new Date("2026-11-04T00:00:30.000Z"), new Date("2026-11-04T23:59:59.000Z")]) {
    const { min, max } = clientRequestTestDateBounds(at);
    assert.equal(clientRequestSpamVerdict(payload({ plannedTestDate: min }), at).kind, "ok", `min ${min}`);
    assert.equal(clientRequestSpamVerdict(payload({ plannedTestDate: max }), at).kind, "ok", `max ${max}`);
    const dayBefore = new Date(Date.parse(`${min}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.parse(`${max}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    assert.equal(clientRequestSpamVerdict(payload({ plannedTestDate: dayBefore }), at).kind, "invalid");
    assert.equal(clientRequestSpamVerdict(payload({ plannedTestDate: dayAfter }), at).kind, "invalid");
  }
  assert.deepEqual(clientRequestTestDateBounds(now), { min: "2025-11-04", max: "2029-11-04" });
});

test("the honeypot field has a name password managers do not autofill", () => {
  assert.notEqual(CLIENT_REQUEST_HONEYPOT_FIELD, "website");
  assert.doesNotMatch(CLIENT_REQUEST_HONEYPOT_FIELD, /web|url|site|email|name|phone|address|pass/i);
  assert.equal(clientRequestSpamVerdict(payload({ website: "https://example.com" }), now).kind, "ok");
});

test("the form uses the server's honeypot name and length caps", () => {
  const form = readFileSync(
    new URL("../../../accepted-admissions/src/pages/public/client-request.tsx", import.meta.url),
    "utf8",
  );
  assert.match(form, new RegExp(`const HONEYPOT_FIELD = "${CLIENT_REQUEST_HONEYPOT_FIELD}"`));
  assert.match(form, new RegExp(`const SHORT_FIELD_MAX = ${CLIENT_REQUEST_SHORT_FIELD_MAX};`));
  assert.match(form, new RegExp(`const LONG_FIELD_MAX = ${CLIENT_REQUEST_LONG_FIELD_MAX};`));
  assert.doesNotMatch(form, /name="website"/);
});
