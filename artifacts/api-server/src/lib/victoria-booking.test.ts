import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SOPHIA_SLEIMAN_SAT_USER_ID, allowsLegacySatPool, canBookSatTutor } from "./sat-tutor-pricing.ts";
import {
  sophiaMayBookVictoria,
  sophiaPreviewTutors,
  sophiaVictoriaComingSoon,
  sophiaVictoriaIdentity,
} from "./sophia-tutor-links.ts";
import {
  VICTORIA_BOOKING_ENABLED,
  isVictoriaCheckoutSlug,
  satBookingTutorChoiceMessage,
  victoriaBookingRefused,
} from "./victoria-booking.ts";

const sophia = { id: SOPHIA_SLEIMAN_SAT_USER_ID, email: "sophia.sleiman@example.invalid" };
const other = { id: "11111111-1111-4111-8111-111111111111", email: "client@example.invalid" };

test("Victoria is hidden from every booking client while her hour pool stays", () => {
  assert.equal(VICTORIA_BOOKING_ENABLED, false);
  assert.equal(canBookSatTutor("victoria", sophia), false);
  assert.equal(canBookSatTutor("victoria", other), false);
  assert.equal(canBookSatTutor("victoria", null), false);
  assert.equal(canBookSatTutor("eunice", sophia), true);
  assert.equal(canBookSatTutor("eunice", other), true);
  assert.equal(canBookSatTutor("xavier", other), true);
  assert.equal(canBookSatTutor("nika", sophia), true);
  assert.equal(allowsLegacySatPool("victoria", sophia), true);
  assert.equal(allowsLegacySatPool("eunice", sophia), true);
  assert.equal(victoriaBookingRefused({ name: "Victoria Wijerathnayapa" }), true);
  assert.equal(victoriaBookingRefused({ tutorKey: "victoria" }), true);
  assert.equal(victoriaBookingRefused({ userId: "a91e7c34-6b20-4f8d-9d47-2c5b8e1a0d63" }), true);
  assert.equal(victoriaBookingRefused({ slug: "sat-victoria-90" }), true);
  assert.equal(victoriaBookingRefused({ slug: "college-consulting-victoria-hour" }), true);
  assert.equal(isVictoriaCheckoutSlug("college-consulting-victoria-120"), true);
  assert.equal(victoriaBookingRefused({ name: "Eunice Chon" }), false);
  assert.equal(victoriaBookingRefused({ tutorKey: "nika" }), false);
  assert.equal(victoriaBookingRefused({ slug: "sat-eunice-60" }), false);
  assert.match(satBookingTutorChoiceMessage(), /Eunice or Xavier/);
  assert.doesNotMatch(satBookingTutorChoiceMessage(), /Victoria/);
  const victoria = { name: "Victoria Wijerathnayapa", calendarStatus: "disconnected" };
  assert.equal(sophiaVictoriaComingSoon(victoria, sophia.id), true);
  assert.equal(sophiaMayBookVictoria(victoria, sophia.id), false);
  assert.equal(sophiaVictoriaComingSoon({ ...victoria, calendarStatus: "connected" }, sophia.id), false);
  assert.equal(sophiaMayBookVictoria({ ...victoria, calendarStatus: "connected" }, sophia.id), true);
  assert.equal(sophiaVictoriaIdentity(victoria, other.id), false);
  assert.equal(sophiaVictoriaComingSoon(victoria, other.id), false);
  assert.equal(sophiaMayBookVictoria({ ...victoria, calendarStatus: "connected" }, other.id), false);
  assert.equal(sophiaVictoriaComingSoon({ name: "Eunice Chon" }, sophia.id), false);
});

test("Sophia's preview shows Victoria at $130 until her calendar connects", () => {
  const disconnected = sophiaPreviewTutors({
    profiles: [
      { id: "victoria-profile", name: "Victoria Wijerathnayapa", calendarStatus: "disconnected" },
      { id: "xavier-profile", name: "Xavier Morales", calendarStatus: "connected" },
      { id: "nika-profile", name: "Nika Raiffe", calendarStatus: "connected" },
      { id: "eunice-profile", name: "Eunice Chon", calendarStatus: "connected" },
    ],
    calendars: { xavier: true, nika: true, eunice: true, victoria: false },
  });
  assert.deepEqual(
    disconnected.map((tutor) => ({
      tutorKey: tutor.tutorKey,
      hourlyRateCents: tutor.hourlyRateCents,
      comingSoon: tutor.comingSoon,
      bookable: tutor.bookable,
    })),
    [
      { tutorKey: "xavier", hourlyRateCents: 20_000, comingSoon: false, bookable: true },
      { tutorKey: "nika", hourlyRateCents: 13_000, comingSoon: false, bookable: true },
      { tutorKey: "eunice", hourlyRateCents: 13_000, comingSoon: false, bookable: true },
      { tutorKey: "victoria", hourlyRateCents: 13_000, comingSoon: true, bookable: false },
    ],
  );
  const connected = sophiaPreviewTutors({
    profiles: [{ id: "victoria-profile", name: "Victoria Wijerathnayapa", calendarStatus: "connected" }],
    calendars: { victoria: true },
  });
  const victoria = connected.find((tutor) => tutor.tutorKey === "victoria");
  assert.equal(victoria?.comingSoon, false);
  assert.equal(victoria?.bookable, true);
  assert.equal(victoria?.hourlyRateCents, 13_000);
  assert.equal(connected.some((tutor) => tutor.hourlyRateCents === 10_000), false);
});

test("booking APIs refuse Victoria and the portal copy does not offer her", async () => {
  const platform = await readFile(fileURLToPath(new URL("../routes/platform.ts", import.meta.url)), "utf8");
  assert.match(platform, /function sharedSatBookingTutorNames/);
  assert.match(platform, /if \(victoriaBookingRefused\(tutor\)\)/);
  assert.match(platform, /victoriaBookingRefused\(\{ slug: product\.slug \}\)/);
  assert.doesNotMatch(platform, /Choose Eunice, Victoria, or Xavier for an SAT session/);
  const satPage = await readFile(
    fileURLToPath(new URL("../../../accepted-admissions/src/pages/portal/sat.tsx", import.meta.url)),
    "utf8",
  );
  assert.doesNotMatch(satPage, /book Eunice, Victoria/);
  assert.doesNotMatch(satPage, /book Nika, Victoria/);
  assert.match(satPage, /book Eunice or Xavier/);
  assert.match(satPage, /book Nika, Xavier, or Eunice/);
});
