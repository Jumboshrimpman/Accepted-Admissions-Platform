import assert from "node:assert/strict";
import test from "node:test";
import {
  collapsedCreditsHeader,
  isPriorityCreditsDashboard,
  michelleCreditsRemainingLabel,
  neelCreditsRemainingLabel,
  sophiaCreditsRemainingLabel,
} from "./credits-remaining-label.ts";

test("Neel names only tutors who still have hours", () => {
  assert.equal(
    neelCreditsRemainingLabel(
      [
        { tutorKey: "xavier", name: "Xavier Morales", hours: 2 },
        { tutorKey: "victoria", name: "Victoria Wijerathnayapa", hours: 1 },
        { tutorKey: "nika", name: "Nika Raiffe", hours: 0 },
        { tutorKey: "eunice", name: "Eunice Chon", hours: 0 },
      ],
    ),
    "1 Victoria hour and 2 Xavier hours credits remaining",
  );
  assert.equal(
    neelCreditsRemainingLabel([{ tutorKey: "nika", name: "Nika", hours: 1 }]),
    "1 Nika hour credits remaining",
  );
  assert.equal(
    neelCreditsRemainingLabel([
      { tutorKey: "nika", name: "Nika", hours: 0 },
      { tutorKey: "xavier", name: "Xavier", hours: 0 },
    ]),
    "0 credits remaining",
  );
  assert.equal(neelCreditsRemainingLabel(undefined, 1), "1 hour credits remaining");
});

test("Sophia always names package and Xavier hours when any remain", () => {
  assert.equal(
    sophiaCreditsRemainingLabel({ legacyHours: 10, xavierHours: 0 }),
    "10 package hours and 0 Xavier hours credits remaining",
  );
  assert.equal(
    sophiaCreditsRemainingLabel({ legacyHours: 0, xavierHours: 2, nikaHours: 1 }),
    "0 package hours, 2 Xavier hours, and 1 Nika hour credits remaining",
  );
  assert.equal(
    sophiaCreditsRemainingLabel({ legacyHours: 0, xavierHours: 0 }),
    "0 credits remaining",
  );
});

test("Michelle keeps a legacy-only balance unnamed and names tagged hours", () => {
  assert.equal(
    michelleCreditsRemainingLabel({ legacyHours: 4, tagged: [{ name: "Xavier", hours: 0 }] }),
    "4 hours credits remaining",
  );
  assert.equal(
    michelleCreditsRemainingLabel({ legacyHours: 4, tagged: [{ name: "Xavier", hours: 1 }] }),
    "4 shared hours and 1 Xavier hour credits remaining",
  );
  assert.equal(
    michelleCreditsRemainingLabel({ legacyHours: 0, tagged: [{ name: "Xavier", hours: 1 }] }),
    "1 Xavier hour credits remaining",
  );
  assert.equal(
    michelleCreditsRemainingLabel({ legacyHours: 0, tagged: [] }),
    "0 credits remaining",
  );
});

test("priority dashboards use the server label, then tutor hours, then one pool", () => {
  assert.equal(
    collapsedCreditsHeader({
      priority: true,
      collegeConsulting: false,
      purchasedHours: 12,
      remainingHours: 10,
      creditsRemainingLabel: "10 package hours and 0 Xavier hours credits remaining",
    }),
    "10 package hours and 0 Xavier hours credits remaining",
  );
  assert.equal(
    collapsedCreditsHeader({
      priority: false,
      collegeConsulting: false,
      purchasedHours: 4,
      remainingHours: 1,
    }),
    "SAT session credits · 4 prepaid hours total",
  );
  assert.equal(isPriorityCreditsDashboard({ userId: "6f4c2a80-1b7e-4d3a-9c55-0e8a7b2d4f19" }), true);
  assert.equal(isPriorityCreditsDashboard({ userId: "bf530aa6-faaa-43df-b3cf-140026f3313e" }), true);
  assert.equal(isPriorityCreditsDashboard({ email: "makaremmichelle7@gmail.com" }), true);
  assert.equal(isPriorityCreditsDashboard({ email: "taito0525@gmail.com" }), false);
});
