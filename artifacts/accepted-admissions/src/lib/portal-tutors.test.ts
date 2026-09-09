import assert from "node:assert/strict";
import test from "node:test";
import { portalTutorsFromDashboard } from "./portal-tutors.ts";

test("twelve-session clients always list Eunice for SAT and Nika for English", () => {
  const tutors = portalTutorsFromDashboard({
    credits: { twelveSessionPlan: true },
    courses: [{ tutors: [] }],
    curriculumSessions: [],
    upcomingSessions: [],
  });
  assert.deepEqual(
    tutors.map((tutor) => [tutor.name, tutor.specialty]),
    [
      ["Eunice Chon", "SAT"],
      ["Nika Raiffe", "English"],
    ],
  );
});

test("merges course and session tutors and maps IELTS to English", () => {
  const tutors = portalTutorsFromDashboard({
    credits: { twelveSessionPlan: false },
    courses: [
      {
        tutors: [{ id: "eunice", name: "Eunice Chon", specialty: "Assigned tutor" }],
      },
    ],
    curriculumSessions: [
      {
        subject: "IELTS",
        tutor: { id: "nika", name: "Nika Raiffe", specialty: "Assigned tutor" },
      },
    ],
    upcomingSessions: [],
  });
  assert.deepEqual(
    tutors.map((tutor) => [tutor.name, tutor.specialty]),
    [
      ["Eunice Chon", "Tutor"],
      ["Nika Raiffe", "English"],
    ],
  );
});
