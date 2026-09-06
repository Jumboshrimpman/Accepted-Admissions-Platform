import assert from "node:assert/strict";
import test from "node:test";
import { filterPeopleByQuery, mergeSessionPeople, personOptionLabel } from "./session-people";

test("session edit can pick Taito, Eunice, and Nika by name or email when IDs exist", () => {
  const clients = mergeSessionPeople(
    [{ id: "taito", name: "Taito Goto", email: "taito0525@gmail.com", assignedTutors: [] }],
    [
      {
        id: "other",
        displayName: "Michelle Makarem",
        email: "michaelmakarem@gmail.com",
        role: "student",
      },
    ],
    "student",
    { assignedTutors: [] },
  );
  const tutors = mergeSessionPeople(
    [
      {
        id: "eunice",
        name: "Eunice Chon",
        email: "eunice_chon@berkeley.edu",
        subjects: ["SAT"],
        active: true,
        calendarStatus: "connected" as const,
        sessionCount: 1,
        upcomingSessionCount: 1,
        assignedStudents: [],
      },
    ],
    [
      {
        id: "nika",
        displayName: "Nika Raiffe",
        email: "nika@example.invalid",
        role: "tutor",
      },
    ],
    "tutor",
    {
      subjects: [],
      active: true,
      calendarStatus: "unavailable",
      sessionCount: 0,
      upcomingSessionCount: 0,
      assignedStudents: [],
    },
  );

  const taito = filterPeopleByQuery(clients, "taito0525");
  const eunice = filterPeopleByQuery(tutors, "Eunice");
  const nika = filterPeopleByQuery(tutors, "nika@");
  assert.equal(taito[0]?.id, "taito");
  assert.equal(eunice[0]?.id, "eunice");
  assert.equal(nika[0]?.id, "nika");
  assert.match(personOptionLabel(nika[0]!), /Nika Raiffe · nika@/);
});
