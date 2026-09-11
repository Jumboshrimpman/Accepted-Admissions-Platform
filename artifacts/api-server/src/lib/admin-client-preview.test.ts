import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  selectAssignedPreviewBookingTutor,
  type PreviewBookingTutorCandidate,
  type PreviewSatAssignment,
} from "./admin-client-preview.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  ACCEPTED_SAT_CATALOG,
  RETIRED_TEST_SAT_HOUR_SLUG,
  previewOffersFromCatalogProducts,
} from "./sat-catalog.ts";

function tutor(
  overrides: Partial<PreviewBookingTutorCandidate> &
    Pick<PreviewBookingTutorCandidate, "id" | "userId" | "name">,
): PreviewBookingTutorCandidate {
  return {
    title: "SAT Tutor",
    calendarStatus: "disconnected",
    subjects: ["SAT"],
    active: true,
    ...overrides,
  };
}

test("assigned SAT tutor wins over an alphabetically earlier unassigned tutor", () => {
  const eunice = tutor({
    id: "eunice-profile",
    userId: "eunice-user",
    name: "Eunice Chon",
    calendarStatus: "disconnected",
  });
  const xavier = tutor({
    id: "xavier-profile",
    userId: "xavier-user",
    name: "Xavier Morales",
    calendarStatus: "connected",
  });
  const assignments: PreviewSatAssignment[] = [
    { tutorUserId: "xavier-user", subject: "SAT" },
  ];

  const selected = selectAssignedPreviewBookingTutor(assignments, [
    eunice,
    xavier,
  ]);
  assert.equal(selected?.id, "xavier-profile");
  assert.equal(selected?.name, "Xavier Morales");
});

test("disconnected unassigned tutor is not chosen when an assigned connected tutor exists", () => {
  const aaron = tutor({
    id: "aaron-profile",
    userId: "aaron-user",
    name: "Aaron Unassigned",
    calendarStatus: "disconnected",
  });
  const xavier = tutor({
    id: "xavier-profile",
    userId: "xavier-user",
    name: "Xavier Morales",
    calendarStatus: "connected",
  });
  const selected = selectAssignedPreviewBookingTutor(
    [{ tutorUserId: "xavier-user", subject: "SAT" }],
    [aaron, xavier],
  );
  assert.equal(selected?.name, "Xavier Morales");
  assert.equal(selected?.calendarStatus, "connected");
});

test("multiple assigned SAT tutors prefer the connected calendar", () => {
  const eunice = tutor({
    id: "eunice-profile",
    userId: "eunice-user",
    name: "Eunice Chon",
    calendarStatus: "disconnected",
  });
  const xavier = tutor({
    id: "xavier-profile",
    userId: "xavier-user",
    name: "Xavier Morales",
    calendarStatus: "connected",
  });
  const selected = selectAssignedPreviewBookingTutor(
    [
      { tutorUserId: "eunice-user", subject: "SAT" },
      { tutorUserId: "xavier-user", subject: "SAT" },
    ],
    [eunice, xavier],
  );
  assert.equal(selected?.name, "Xavier Morales");
});

test("English-only assignments do not select a SAT preview tutor", () => {
  const nika = tutor({
    id: "nika-profile",
    userId: "nika-user",
    name: "Nika Raiffe",
    subjects: ["IELTS"],
    calendarStatus: "connected",
  });
  const eunice = tutor({
    id: "eunice-profile",
    userId: "eunice-user",
    name: "Eunice Chon",
    calendarStatus: "disconnected",
  });
  const selected = selectAssignedPreviewBookingTutor(
    [{ tutorUserId: "nika-user", subject: "IELTS" }],
    [eunice, nika],
  );
  assert.equal(selected, undefined);
});

test("preview offers include the active SAT catalog products and omit retired SKUs", () => {
  const offers = previewOffersFromCatalogProducts([
    {
      slug: RETIRED_TEST_SAT_HOUR_SLUG,
      name: "Test",
      description: "Retired",
      active: true,
      durationHours: 1,
      totalPriceCents: 100,
    },
    {
      slug: "decoy-sat",
      name: "Decoy",
      description: "Not in catalog",
      active: true,
      durationHours: 1,
      totalPriceCents: 50,
    },
    {
      slug: "ten-sat-session-package",
      name: "Ten SAT Session Package",
      description: ACCEPTED_SAT_CATALOG[1]!.description,
      active: true,
      durationHours: 10,
      totalPriceCents: 130_000,
    },
    {
      slug: "single-sat-session",
      name: "Single SAT Session",
      description: ACCEPTED_SAT_CATALOG[0]!.description,
      active: true,
      durationHours: 1,
      totalPriceCents: 13_000,
    },
  ]);

  assert.deepEqual(
    offers.map((offer) => ({
      slug: offer.slug,
      priceCents: offer.priceCents,
      durationHours: offer.durationHours,
      durationMinutes: offer.durationMinutes,
    })),
    [
      {
        slug: "single-sat-session",
        priceCents: 13_000,
        durationHours: 1,
        durationMinutes: 60,
      },
      {
        slug: "ten-sat-session-package",
        priceCents: 130_000,
        durationHours: 10,
        durationMinutes: 60,
      },
    ],
  );
  assert.equal(offers.some((offer) => offer.slug === RETIRED_TEST_SAT_HOUR_SLUG), false);
  assert.equal(
    offers.some((offer) => offer.name === "Single SAT Session"),
    true,
  );
  assert.equal(
    offers.some((offer) => offer.name === "Ten SAT Session Package"),
    true,
  );
});
