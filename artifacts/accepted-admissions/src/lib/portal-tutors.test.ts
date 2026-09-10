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

test("dedupes Eunice and Nika when course and session tutor ids differ", () => {
  const tutors = portalTutorsFromDashboard({
    credits: { twelveSessionPlan: true },
    courses: [
      {
        tutors: [
          { id: "eunice", name: "Eunice Chon", specialty: "SAT Tutor" },
          { id: "nika", name: "Nika Raiffe", specialty: "English Tutor" },
        ],
      },
    ],
    curriculumSessions: [
      {
        subject: "SAT",
        tutor: { id: "tutor", name: "Eunice Chon", specialty: "SAT Tutor" },
      },
      {
        subject: "IELTS",
        tutor: { id: "tutor-2", name: "Nika Raiffe", specialty: "IELTS Tutor" },
      },
    ],
    upcomingSessions: [
      {
        subject: "SAT",
        tutor: { id: "eunice-user", name: "Eunice Chon" },
      },
    ],
  });
  assert.deepEqual(
    tutors.map((tutor) => [tutor.name, tutor.specialty]),
    [
      ["Eunice Chon", "SAT"],
      ["Nika Raiffe", "English"],
    ],
  );
});

test("dedupes the same tutor by email or first name, including Xavier", () => {
  const tutors = portalTutorsFromDashboard({
    credits: { twelveSessionPlan: false },
    courses: [
      {
        tutors: [
          { id: "user-eunice", name: "Eunice", email: "eunice_chon@berkeley.edu", specialty: "SAT Tutor" },
          { id: "user-xavier", name: "Xavier Morales", email: "xaver.rmz6@gmail.com", specialty: "SAT Tutor" },
        ],
      },
    ],
    curriculumSessions: [
      {
        subject: "SAT",
        tutor: { id: "profile-eunice", name: "Eunice Chon", email: "eunice_chon@berkeley.edu" },
      },
      {
        subject: "SAT",
        tutor: { id: "profile-xavier", name: "Xavier", email: "xaver.rmz6@gmail.com" },
      },
    ],
    upcomingSessions: [
      {
        subject: "IELTS",
        tutor: { id: "nika-session", name: "Nika Raiffe" },
      },
      {
        subject: "IELTS",
        tutor: { id: "nika-other", name: "Nika" },
      },
    ],
  });
  assert.deepEqual(
    tutors.map((tutor) => [tutor.name, tutor.specialty]),
    [
      ["Eunice Chon", "SAT"],
      ["Nika Raiffe", "English"],
      ["Xavier Morales", "SAT"],
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
