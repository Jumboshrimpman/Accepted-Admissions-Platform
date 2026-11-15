import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSULTING_TUTOR_PHOTO_CLASS,
  PORTAL_VICTORIA_PHOTO_URL,
  consultingCreditsTutorLabel,
  portalBookingTutorPhoto,
  portalCheckoutCopy,
  portalTutorFirstName,
} from "./consulting-tutor-display.ts";

test("college consulting labels use Nika and Victoria's first names only", () => {
  assert.equal(consultingCreditsTutorLabel("Nika Raiffe"), "Nika");
  assert.equal(consultingCreditsTutorLabel("Victoria Wijerathnayapa"), "Victoria");
  assert.equal(consultingCreditsTutorLabel("Victoria"), "Victoria");
  assert.equal(consultingCreditsTutorLabel("Xavier Morales"), "Xavier Morales");
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /object-cover/);
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /object-center/);
  assert.match(CONSULTING_TUTOR_PHOTO_CLASS, /max-w-28/);
  assert.equal(portalTutorFirstName("Nika Raiffe"), "Nika");
  assert.equal(portalTutorFirstName("Victoria Wijerathnayapa"), "Victoria");
  assert.equal(portalTutorFirstName("Xavier Morales"), "Xavier");
  assert.equal(portalTutorFirstName("Eunice Chon"), "Eunice");
  assert.equal(
    portalBookingTutorPhoto("Victoria Wijerathnayapa", "/media/team/victoria.jpg"),
    PORTAL_VICTORIA_PHOTO_URL,
  );
  assert.equal(
    portalBookingTutorPhoto("Xavier Morales", "/media/team/xavier-morales.jpg"),
    "/media/team/xavier-morales.jpg",
  );
  assert.equal(portalBookingTutorPhoto("Xavier Morales", null), "/media/team/xavier-morales.jpg");
  assert.equal(portalBookingTutorPhoto("Xavier", null), "/media/team/xavier-morales.jpg");
  assert.equal(portalBookingTutorPhoto("Xavier", "   "), "/media/team/xavier-morales.jpg");
  assert.equal(
    portalBookingTutorPhoto("Xavier Morales", "https://example.com/xavier-custom.jpg"),
    "https://example.com/xavier-custom.jpg",
  );
  assert.equal(portalBookingTutorPhoto("Blank Tutor", null), null);
  assert.equal(
    portalCheckoutCopy("College Consulting hour with Xavier Morales"),
    "College Consulting hour with Xavier",
  );
  assert.equal(
    portalCheckoutCopy("College Consulting hour with Nika"),
    "College Consulting hour with Nika",
  );
});

test("Sophia Lamas uses her square portal headshot on booking cards", async () => {
  const { PORTAL_SOPHIA_LAMAS_PHOTO_URL } = await import("./consulting-tutor-display.ts");
  assert.equal(PORTAL_SOPHIA_LAMAS_PHOTO_URL, "/media/portal/sophia-lamas.jpg");
  assert.equal(portalBookingTutorPhoto("Sophia Lamas", null), PORTAL_SOPHIA_LAMAS_PHOTO_URL);
  assert.equal(
    portalBookingTutorPhoto("Sophia Lamas", "/media/team/sophia-lamas.jpg"),
    PORTAL_SOPHIA_LAMAS_PHOTO_URL,
  );
  assert.equal(portalBookingTutorPhoto("Eunice Chon", null), "/media/team/eunice-chon.jpg");
  assert.equal(portalBookingTutorPhoto("Nika Raiffe", null), "/media/team/nika-raiffe.png");
});
