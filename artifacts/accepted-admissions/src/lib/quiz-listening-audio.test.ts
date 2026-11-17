import assert from "node:assert/strict";
import test from "node:test";
import {
  isSafeQuizAudioSrc,
  looksLineStructuredQuizText,
  quizAudioFromText,
  splitQuizRichText,
  stripQuizAudioTokens,
} from "./quiz-rich-text.ts";

const token = "[[audio:/media/ielts-listening/taito-2026-11-20-part1.mp3|Part 1 recording]]";

test("listening audio token becomes an audio part", () => {
  const parts = splitQuizRichText(`${token}\n\nQuestions 11–14 Choose the correct letter.`);
  assert.deepEqual(parts[0], {
    type: "audio",
    src: "/media/ielts-listening/taito-2026-11-20-part1.mp3",
    label: "Part 1 recording",
  });
  assert.equal(parts[1]?.type, "text");
});

test("hideAudio drops the token without leaving raw markup", () => {
  const parts = splitQuizRichText(`${token}\n\nNotes`, { hideAudio: true });
  assert.equal(parts.some((part) => part.type === "audio"), false);
  assert.equal(parts.some((part) => part.type === "text" && part.value.includes("[[audio")), false);
});

test("only site-hosted audio files play", () => {
  assert.equal(isSafeQuizAudioSrc("/media/ielts-listening/a.mp3"), true);
  assert.equal(isSafeQuizAudioSrc("https://evil.example/a.mp3"), false);
  assert.equal(isSafeQuizAudioSrc("/media/../secret.mp3"), false);
  assert.equal(isSafeQuizAudioSrc("javascript:alert(1)"), false);
  assert.equal(quizAudioFromText("[[audio:https://evil.example/a.mp3|x]]"), null);
  const parts = splitQuizRichText("[[audio:https://evil.example/a.mp3|x]] text");
  assert.equal(parts.some((part) => part.type === "audio"), false);
});

test("quizAudioFromText finds the recording and default label", () => {
  assert.deepEqual(quizAudioFromText(`intro ${token}`), {
    src: "/media/ielts-listening/taito-2026-11-20-part1.mp3",
    label: "Part 1 recording",
  });
  assert.equal(quizAudioFromText("[[audio:/media/ielts-listening/p.mp3]]")?.label, "Listening recording");
  assert.equal(stripQuizAudioTokens(`${token}\nNotes`), "Notes");
});

test("IELTS forms keep one line per field", () => {
  const form = "Surname: (1) __________\nStart date: (2) __________\nBoat requested: the (3) __________";
  assert.equal(looksLineStructuredQuizText(form), true);
  const parts = splitQuizRichText(form);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type === "text" && parts[0].value.split("\n").length, 3);
});

test("option boxes keep their lines and are not read as tables", () => {
  const box = "A  use it only for background\nB  use it to explain the history\nC  use it as the main comparison";
  const parts = splitQuizRichText(box);
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "text");
  assert.equal(parts[0]?.type === "text" && parts[0].value.includes("\nB  use"), true);
});

test("SAT blanks and wrapped OCR text still join into prose", () => {
  const sat = "In 2019, researchers prepared a stew from\na clay tablet. ______ the\nresearchers theorized the name.";
  assert.equal(looksLineStructuredQuizText(sat), false);
  const parts = splitQuizRichText(sat);
  assert.equal(parts[0]?.type === "text" && parts[0].value.includes("\n"), false);
});

test("labelled lists are detected after spaces are collapsed, but only in sequence", () => {
  assert.equal(looksLineStructuredQuizText("A pledge graph\nB coding scheme\nC comparison campaign"), true);
  assert.equal(looksLineStructuredQuizText("15 Pond-dipping platform\n16 Picnic meadow\n17 First-aid point"), true);
  assert.equal(looksLineStructuredQuizText("A study found that\nI think the\nA second group of"), false);
  assert.equal(looksLineStructuredQuizText("In 2019 the team\n3 samples were\n12 more were"), false);
});

test("numeric tables are not mistaken for labelled lists", () => {
  assert.equal(looksLineStructuredQuizText("x f(x)\n0 29\n1 32\n2 35"), false);
  assert.equal(looksLineStructuredQuizText("Number\tCount\n0\t8\n1\t14\n2\t10"), false);
});
