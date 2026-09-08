import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  claimableEmailsForUser,
  isRetiredTutorProfile,
  portalEmailsForGoogleMatch,
  scoreCalendarProfile,
  selectBestCalendarProfile,
} from "./calendar-profile-match.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { googleAccountMatchesPortalEmails } from "./google-calendar.ts";

test("Xavier portal emails also accept the retired Google accounts; Eunice stays exact", () => {
  assert.deepEqual(claimableEmailsForUser({ email: "xaver.rmz6@gmail.com" }).sort(), [
    "xaver.rmz6@gmail.com",
    "xavier.rmz6@gmail.com",
    "xsfam6@gmail.com",
  ].sort());
  assert.deepEqual(claimableEmailsForUser({ email: "eunice_chon@berkeley.edu" }), [
    "eunice_chon@berkeley.edu",
  ]);
  assert.equal(
    googleAccountMatchesPortalEmails(
      "xsfam6@gmail.com",
      portalEmailsForGoogleMatch({
        email: "xaver.rmz6@gmail.com",
        userEmail: "xaver.rmz6@gmail.com",
      }),
    ),
    true,
  );
  assert.equal(
    googleAccountMatchesPortalEmails(
      "xaver.rmz6@gmail.com",
      portalEmailsForGoogleMatch({
        email: "eunice_chon@berkeley.edu",
        userEmail: "eunice_chon@berkeley.edu",
      }),
    ),
    false,
  );
});

test("retired or superseded tutor profiles are never selected for Calendar OAuth", () => {
  assert.equal(
    isRetiredTutorProfile({
      email: "retired+xavier-duplicate-aaaaaaaa@retired.accepted.local",
      name: "Xavier Morales",
      internalNotes: "SUPERSEDED: duplicate Xavier Clerk user.",
    }),
    true,
  );
  const user = { id: "user-eunice", email: "eunice_chon@berkeley.edu" };
  const winner = {
    id: "profile-eunice",
    userId: user.id,
    email: "eunice_chon@berkeley.edu",
    name: "Eunice Chon",
    title: "SAT Tutor",
    active: true,
    bookingEligible: true,
    publicApproved: true,
    calendarStatus: "disconnected",
  };
  const stub = {
    id: "profile-stub",
    userId: user.id,
    email: "eunice_chon@berkeley.edu",
    name: "Eunice Chon",
    title: "Calendar account",
    active: true,
    bookingEligible: false,
    publicApproved: false,
    calendarStatus: "disconnected",
  };
  const selected = selectBestCalendarProfile([stub, winner], user);
  assert.equal(selected?.id, "profile-eunice");
  assert.ok(scoreCalendarProfile(winner, user) > scoreCalendarProfile(stub, user));
});
