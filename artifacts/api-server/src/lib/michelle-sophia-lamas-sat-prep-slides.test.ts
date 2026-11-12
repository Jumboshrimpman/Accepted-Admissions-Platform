import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { execFileSync } from "node:child_process";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { MICHELLE_MAKAREM_EMAIL, MICHELLE_MAKAREM_CLERK_USER_ID } from "./calendar-pair-attendees.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SOPHIA_LAMAS_TUTOR_EMAIL, SOPHIA_LAMAS_TUTOR_NAME } from "./admin-calendar-fallback.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  assignedStemFromConfig,
  ensureMichelleSophiaLamasSatPrepSlides,
  MICHELLE_SOPHIA_LAMAS_SAT_PREP_DECKS,
  nextSatPrepDeck,
  nextSatPrepDeckForSession,
  satPrepDisplayTitle,
  satPrepSeedKey,
  sessionConsumesSatPrepQueue,
  shouldAttachMichelleSophiaLamasSatPrep,
} from "./michelle-sophia-lamas-sat-prep-slides.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const mediaDir = path.join(
  repoRoot,
  "artifacts/accepted-admissions/public/media/sat-prep",
);
const modulePath = path.join(here, "michelle-sophia-lamas-sat-prep-slides.ts");
const platformPath = path.join(here, "../routes/platform.ts");

const michelle = {
  id: MICHELLE_MAKAREM_USER_ID,
  email: MICHELLE_MAKAREM_EMAIL,
  clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID,
};
const sophiaLamas = { name: SOPHIA_LAMAS_TUTOR_NAME, email: SOPHIA_LAMAS_TUTOR_EMAIL };
const xavier = { name: "Xavier Young", email: "xavier@example.invalid" };

test("display titles redo only the 11-4 style date in America/New_York", () => {
  assert.equal(
    satPrepDisplayTitle("SAT_Prep_I", new Date("2026-11-16T14:00:00.000Z")),
    "SAT_Prep_I_11-16",
  );
  assert.equal(
    satPrepDisplayTitle("SAT_Prep_II", new Date("2026-11-18T14:00:00.000Z")),
    "SAT_Prep_II_11-18",
  );
  assert.equal(
    satPrepDisplayTitle("SAT_Prep_III", new Date("2026-11-24T14:00:00.000Z")),
    "SAT_Prep_III_11-24",
  );
  assert.equal(
    satPrepDisplayTitle("SAT_Prep_IV", new Date("2027-01-05T14:00:00.000Z")),
    "SAT_Prep_IV_1-5",
  );
  // 00:30 UTC on Nov 16 is still Nov 15 in America/New_York.
  assert.equal(
    satPrepDisplayTitle("SAT_Prep_I", new Date("2026-11-16T04:30:00.000Z")),
    "SAT_Prep_I_11-15",
  );
});

test("the first four Michelle–Sophia Lamas bookings get Prep I–IV in order", () => {
  const first = nextSatPrepDeck([]);
  assert.equal(first?.stem, "SAT_Prep_I");
  const second = nextSatPrepDeck(["SAT_Prep_I"]);
  assert.equal(second?.stem, "SAT_Prep_II");
  const third = nextSatPrepDeck(["SAT_Prep_I", "SAT_Prep_II"]);
  assert.equal(third?.stem, "SAT_Prep_III");
  const fourth = nextSatPrepDeck(["SAT_Prep_I", "SAT_Prep_II", "SAT_Prep_III"]);
  assert.equal(fourth?.stem, "SAT_Prep_IV");
  assert.equal(
    nextSatPrepDeck(["SAT_Prep_I", "SAT_Prep_II", "SAT_Prep_III", "SAT_Prep_IV"]),
    null,
  );
});

test("a fifth booking is left unassigned and does not reuse Prep I", () => {
  const deck = nextSatPrepDeckForSession({
    currentSessionId: "session-5",
    currentCreatedAt: new Date("2026-12-01T14:00:00.000Z"),
    peers: [
      { id: "s1", createdAt: new Date("2026-11-16T14:00:00.000Z"), assignedStem: "SAT_Prep_I" },
      { id: "s2", createdAt: new Date("2026-11-17T14:00:00.000Z"), assignedStem: "SAT_Prep_II" },
      { id: "s3", createdAt: new Date("2026-11-18T14:00:00.000Z"), assignedStem: "SAT_Prep_III" },
      { id: "s4", createdAt: new Date("2026-11-19T14:00:00.000Z"), assignedStem: "SAT_Prep_IV" },
    ],
  });
  assert.equal(deck, null);
});

test("cancelling with restored credit frees that deck instead of skipping it", () => {
  assert.equal(
    sessionConsumesSatPrepQueue({ bookingStatus: "cancelled", creditRestored: true }),
    false,
  );
  assert.equal(
    sessionConsumesSatPrepQueue({ bookingStatus: "cancelled", creditRestored: false }),
    true,
  );
  const next = nextSatPrepDeckForSession({
    currentSessionId: "session-new",
    currentCreatedAt: new Date("2026-11-20T14:00:00.000Z"),
    peers: [
      { id: "kept-ii", createdAt: new Date("2026-11-18T14:00:00.000Z"), assignedStem: "SAT_Prep_II" },
    ],
  });
  assert.equal(next?.stem, "SAT_Prep_I");
});

test("rescheduling keeps the same stem and only rewrites the title date", () => {
  const stem = assignedStemFromConfig({
    seedKey: satPrepSeedKey("I"),
    satPrepStem: "SAT_Prep_I",
    title: "SAT_Prep_I_11-16",
  });
  assert.equal(stem, "SAT_Prep_I");
  assert.equal(
    satPrepDisplayTitle(stem!, new Date("2026-11-23T14:00:00.000Z")),
    "SAT_Prep_I_11-23",
  );
});

test("other tutors and other clients are not attached", () => {
  assert.equal(
    shouldAttachMichelleSophiaLamasSatPrep({
      subject: "SAT",
      bookingStatus: "confirmed",
      client: michelle,
      tutor: sophiaLamas,
    }),
    true,
  );
  assert.equal(
    shouldAttachMichelleSophiaLamasSatPrep({
      subject: "SAT",
      bookingStatus: "confirmed",
      client: michelle,
      tutor: xavier,
    }),
    false,
  );
  assert.equal(
    shouldAttachMichelleSophiaLamasSatPrep({
      subject: "SAT",
      bookingStatus: "confirmed",
      client: michelle,
      tutor: { name: "Eunice Chon", email: "eunice@example.invalid" },
    }),
    false,
  );
  assert.equal(
    shouldAttachMichelleSophiaLamasSatPrep({
      subject: "SAT",
      bookingStatus: "confirmed",
      client: michelle,
      tutor: { name: "Nika", email: "nika@example.invalid" },
    }),
    false,
  );
  assert.equal(
    shouldAttachMichelleSophiaLamasSatPrep({
      subject: "SAT",
      bookingStatus: "confirmed",
      client: { id: "other-client", email: "other@example.invalid", clerkUserId: "user_other" },
      tutor: sophiaLamas,
    }),
    false,
  );
  assert.equal(
    shouldAttachMichelleSophiaLamasSatPrep({
      subject: "College Consulting",
      bookingStatus: "confirmed",
      client: michelle,
      tutor: sophiaLamas,
    }),
    false,
  );
});

test("repo templates are date-free SAT Prep I–IV copies and are not the Google originals", () => {
  assert.deepEqual(
    MICHELLE_SOPHIA_LAMAS_SAT_PREP_DECKS.map((deck) => deck.filename),
    ["SAT_Prep_I.pptx", "SAT_Prep_II.pptx", "SAT_Prep_III.pptx", "SAT_Prep_IV.pptx"],
  );
  const expectedText: Record<string, string> = {
    "SAT_Prep_I.pptx": "SAT PREP I",
    "SAT_Prep_II.pptx": "SAT PREP II",
    "SAT_Prep_III.pptx": "SAT PREP III",
    "SAT_Prep_IV.pptx": "SAT PREP IV",
  };
  for (const deck of MICHELLE_SOPHIA_LAMAS_SAT_PREP_DECKS) {
    const filePath = path.join(mediaDir, deck.filename);
    assert.equal(path.basename(filePath), deck.filename);
    assert.doesNotMatch(deck.filename, /\d{1,2}-\d{1,2}/);
    assert.equal(fs.existsSync(filePath), true, `${deck.filename} should be in the repo`);
    const bytes = fs.readFileSync(filePath);
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
    const text = execFileSync(
      "python3",
      [
        "-c",
        "import sys,zipfile; from xml.etree import ElementTree as ET\n"
        + "ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}\n"
        + "z=zipfile.ZipFile(sys.argv[1]); root=ET.fromstring(z.read('ppt/slides/slide1.xml'))\n"
        + "print(' '.join(t.text for t in root.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}t') if t.text))",
        filePath,
      ],
      { encoding: "utf8" },
    );
    assert.match(text, new RegExp(expectedText[deck.filename]!));
    assert.doesNotMatch(path.basename(filePath), /11-4|11-11|11-18|11-24/);
  }
});

test("attach path does not generate pre-work or mutate the original Google files", () => {
  const moduleSource = fs.readFileSync(modulePath, "utf8");
  const platformSource = fs.readFileSync(platformPath, "utf8");
  assert.match(moduleSource, /never reads, copies, renames, or edits the original Google/);
  assert.doesNotMatch(moduleSource, /ensureAutogeneratedSatPrework|assignSessionPreworkFromBank|slides\.googleapis|presentations\.batchUpdate|files\.update|files\.copy/);
  assert.match(
    platformSource,
    /ensureMichelleSophiaLamasSatPrepSlidesSafe\(session\.id\)/,
  );
  assert.match(
    platformSource,
    /ensureMichelleSophiaLamasSatPrepSlidesForSessionsSafe/,
  );
  assert.equal(typeof ensureMichelleSophiaLamasSatPrepSlides, "function");
});
