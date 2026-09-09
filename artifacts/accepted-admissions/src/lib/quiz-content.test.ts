import assert from "node:assert/strict";
import test from "node:test";
import {
  isLiveListedSession,
  isUnfinishedHomeworkClientCopy,
  normalizeQuizProse,
  parseQuizContent,
  stripQuizHtmlComments,
} from "./quiz-content.ts";

test("strips sat-bank figure comments and renders markdown images", () => {
  const segments = parseQuizContent(
    "<!-- sat-bank-figures -->\n![Sphere](https://cdn.example/sphere.png)\n<!-- /sat-bank-figures -->\nWhat is the volume?",
  );
  assert.deepEqual(segments, [
    { type: "image", alt: "Sphere", src: "https://cdn.example/sphere.png" },
    { type: "text", value: "What is the volume?" },
  ]);
  assert.equal(stripQuizHtmlComments("keep <!-- sat-bank-figures --> me").includes("sat-bank-figures"), false);
});

test("rejects javascript image URLs in quiz figures", () => {
  const segments = parseQuizContent("![x](javascript:alert(1)) leftover");
  assert.equal(segments.some((segment) => segment.type === "image"), false);
  assert.ok(segments.some((segment) => segment.type === "text" && segment.value.includes("leftover")));
});

test("collapses OCR line breaks so prose reads as one sentence", () => {
  assert.equal(
    normalizeQuizProse("A customer spent $ 27 to purchase oranges at $ 3\nper\npound. How many pounds of oranges did the\ncustomer purchase?"),
    "A customer spent $ 27 to purchase oranges at $ 3 per pound. How many pounds of oranges did the customer purchase?",
  );
});

test("hides unfinished-homework banners and cancelled session cards", () => {
  assert.equal(
    isUnfinishedHomeworkClientCopy(
      "Homework was not finished. The live plan now carries the unfinished prep so the student and tutor can complete it together.",
    ),
    true,
  );
  assert.equal(isLiveListedSession({ bookingStatus: "cancelled" }), false);
  assert.equal(isLiveListedSession({ bookingStatus: "confirmed" }), true);
  assert.equal(isLiveListedSession({}), true);
});
