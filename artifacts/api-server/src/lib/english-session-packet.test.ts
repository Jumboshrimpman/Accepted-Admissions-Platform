import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildEnglishSessionPacket,
  renderEnglishSessionPacketPdf,
  type EnglishSessionPacket,
} from "./english-session-packet.ts";
import { renderSessionQuestionPdf } from "./session-question-pdf.ts";
import { taitoSessionDateTime } from "./session-schedule.ts";

function sessionOn(dateKey: string, subject = "IELTS", email?: string) {
  return {
    dateTime: taitoSessionDateTime(dateKey),
    subject,
    timezone: "Asia/Tokyo",
    email,
  };
}

function readingAnswers(packet: EnglishSessionPacket): string[] {
  return packet.sections.flatMap((section) =>
    section.questions
      .filter((question) => !question.suppressAnswerLine)
      .map((question) => question.correctAnswer ?? ""),
  );
}

function letterCounts(answers: string[]) {
  return {
    A: answers.filter((letter) => letter === "A").length,
    B: answers.filter((letter) => letter === "B").length,
    C: answers.filter((letter) => letter === "C").length,
    D: answers.filter((letter) => letter === "D").length,
  };
}

test("Oct 23 packet is the corrected 24-question diagnostic plus both writing prompts", () => {
  const packet = buildEnglishSessionPacket(sessionOn("2026-10-23"));
  assert.ok(packet);
  assert.equal(packet.dateKey, "2026-10-23");
  assert.equal(packet.readingCount, 24);
  assert.equal(packet.writingCount, 2);
  const answers = readingAnswers(packet);
  assert.deepEqual(letterCounts(answers), { A: 6, B: 6, C: 6, D: 6 });
  assert.equal(answers[0], "A");
  const fee = packet.sections
    .flatMap((section) => section.questions)
    .find((question) => question.prompt.includes("weekly cooperative fee"));
  assert.equal(fee?.correctAnswer, "C");
  const writing = packet.sections.at(-1);
  assert.equal(writing?.title, "Writing prompts");
  assert.equal(writing?.questions.length, 2);
  assert.equal(writing?.questions.every((question) => question.suppressAnswerLine), true);
  assert.match(writing?.questions[0]?.explanation ?? "", /lexical/);
  assert.match(packet.sections[0]?.passage ?? "", /Kell Harbor/);
  assert.doesNotMatch(packet.sections[0]?.passage ?? "", /centres/);
});

test("Nov 13 and Dec 4 packets are the routine sets without writing prompts", () => {
  const november = buildEnglishSessionPacket(sessionOn("2026-11-13", "English"));
  const december = buildEnglishSessionPacket(sessionOn("2026-12-04"));
  assert.ok(november);
  assert.ok(december);
  assert.equal(november.readingCount, 12);
  assert.equal(november.writingCount, 0);
  assert.equal(december.readingCount, 12);
  assert.equal(december.writingCount, 0);
  assert.equal(november.sections[0]?.title, "Fermentation logs in a neighborhood bakery");
  assert.equal(readingAnswers(november)[0], "B");
  assert.equal(december.sections[0]?.title, "Redesigning a harbor ferry timetable");
  assert.equal(readingAnswers(december)[0], "B");
  assert.equal(
    november.sections.some((section) => section.title === "Writing prompts"),
    false,
  );
});

test("another student's same-day English session and SAT sessions are not packets", () => {
  assert.equal(
    buildEnglishSessionPacket(sessionOn("2026-10-23", "IELTS", "michelle@example.com")),
    null,
  );
  assert.equal(buildEnglishSessionPacket(sessionOn("2026-10-23", "SAT")), null);
  assert.equal(buildEnglishSessionPacket(sessionOn("2026-10-30", "IELTS")), null);
});

test("question PDFs omit keys and answer PDFs keep letters, explanations, and writing notes", () => {
  const packet = buildEnglishSessionPacket(sessionOn("2026-10-23"));
  assert.ok(packet);
  const shared = {
    sessionTitle: "Taito's English Session with Nika",
    sessionDateLabel: "Fri, Oct 23, 2026, 9:00 PM GMT+9",
    studentName: "Taito",
  };
  const questions = renderEnglishSessionPacketPdf(packet, {
    ...shared,
    includeAnswerKey: false,
  }).toString("latin1");
  const answers = renderEnglishSessionPacketPdf(packet, {
    ...shared,
    includeAnswerKey: true,
  }).toString("latin1");
  assert.match(questions, /English session questions/);
  assert.match(questions, /\(Kell\)/);
  assert.match(questions, /\(Harbor,\)/);
  assert.match(questions, /\(cubic\)/);
  assert.match(questions, /\(rooftops\)/);
  assert.match(questions, /\(official\)/);
  assert.match(questions, /\(score\.\)/);
  assert.doesNotMatch(questions, /\(Answer:\)/);
  assert.doesNotMatch(questions, /\(centres\)/);
  assert.doesNotMatch(questions, /\(lexical\)/);
  assert.doesNotMatch(questions, /\(tutor\.\)/);
  assert.doesNotMatch(questions, /TODO|lorem|placeholder/i);
  assert.match(answers, /answer key/);
  assert.match(answers, /\(Answer:\)/);
  assert.match(answers, /\(centres\)/);
  assert.match(answers, /\(lexical\)/);
  assert.match(answers, /\(tutor\.\)/);
  assert.match(answers, /\(student\.\)/);
  assert.doesNotMatch(answers, /Answer: —/);
  assert.doesNotMatch(answers, /TODO|lorem|placeholder/i);
  assert.match(questions, /\/Type \/Pages \/Count \d+/);
  assert.match(answers, /\/Type \/Pages \/Count \d+/);
});

test("passage text and fractions render through the PDF text engine", () => {
  const pdf = renderSessionQuestionPdf({
    phase: "before_session",
    includeAnswerKey: false,
    documentTitle: "English session questions",
    preamble: "Original IELTS-style practice. Not an official IELTS score.",
    sessionTitle: "Sample",
    sessionDateLabel: "Fri, Oct 23, 2026",
    studentName: "Taito",
    sections: [
      {
        title: "Passage",
        passage: "The ratio was \\frac{1}{2} after the room reached 12°C.",
        questions: [{ prompt: "What changed?", choices: [{ label: "A", text: "The ratio" }] }],
      },
    ],
  });
  const text = pdf.toString("latin1");
  assert.match(text, /\(ratio\)/);
  assert.match(text, /\(reached\)/);
  assert.match(text, /\(1\)/);
  assert.match(text, /\(2\)/);
  assert.doesNotMatch(text, /\\frac/);
  assert.doesNotMatch(text, /\(Answer:\)/);
});

test("English sessions use the shared question PDF route instead of a Nika email check", async () => {
  const source = await readFile(new URL("../routes/platform.ts", import.meta.url), "utf8");
  assert.equal(source.includes('"/sessions/:sessionId/english-packet-pdf"'), false);
  assert.equal(source.includes("decideEnglishPacketPdfAccess"), false);
  assert.equal(source.includes("NIKA_TUTOR_EMAIL"), false);
  const start = source.indexOf('"/sessions/:sessionId/question-pdf"');
  assert.ok(start > 0);
  const slice = source.slice(start, source.indexOf("async function listAssignmentsForUser", start));
  const accessAt = slice.indexOf("decideSessionQuestionPdfAccess");
  const aliasAt = slice.indexOf("temporaryAliasMayDownloadAnswerKey");
  const renderAt = slice.indexOf("renderSessionQuestionPdf");
  assert.ok(accessAt > 0);
  assert.ok(aliasAt > accessAt);
  assert.ok(renderAt > aliasAt);
  assert.match(slice, /sessionTutorUserId: session\.tutorUserId/);
});
