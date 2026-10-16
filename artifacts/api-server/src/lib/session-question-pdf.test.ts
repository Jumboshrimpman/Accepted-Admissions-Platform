import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  decideSessionQuestionPdfAccess,
  renderSessionQuestionPdf,
} from "./session-question-pdf.ts";

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodeRgbPng(width: number, height: number, rgb: Buffer): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const start = y * (1 + width * 3);
    raw[start] = 0;
    rgb.copy(raw, start + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const figure = encodeRgbPng(2, 2, Buffer.from([
  20, 40, 80, 20, 40, 80,
  200, 10, 10, 200, 10, 10,
]));

const sample = {
  phase: "before_session" as const,
  sessionTitle: "Taito’s SAT Session with Eunice",
  sessionDateLabel: "Fri, Oct 16, 2026, 8:00 AM EDT",
  studentName: "Taito Goto",
  questions: [
    {
      prompt: "Solve 3x^2 + \\frac{1}{2} = 10 for the line in the figure.",
      stimulus: "Heart-of-algebra clinic for the Oct 16 session.",
      choices: [
        { label: "A", text: "x = 2" },
        { label: "B", text: "x = \\frac{3}{2}" },
      ],
      figures: [{ alt: "Line through (0, 1) and (2, 5)", bytes: figure }],
      correctAnswer: "B",
      explanation: "Square the known root, then undo the one-half shift.",
    },
  ],
};

test("students and other tutors are denied; the assigned tutor and admins are allowed", () => {
  assert.equal(
    decideSessionQuestionPdfAccess({
      role: "student",
      requesterUserId: "student-1",
      sessionTutorUserId: "tutor-eunice",
    }).status,
    403,
  );
  assert.equal(
    decideSessionQuestionPdfAccess({
      role: "viewer",
      requesterUserId: "parent-1",
      sessionTutorUserId: "tutor-eunice",
    }).status,
    403,
  );
  assert.equal(
    decideSessionQuestionPdfAccess({
      role: "tutor",
      requesterUserId: "tutor-other",
      sessionTutorUserId: "tutor-eunice",
    }).status,
    403,
  );
  assert.equal(
    decideSessionQuestionPdfAccess({
      role: "tutor",
      requesterUserId: "tutor-eunice",
      sessionTutorUserId: "tutor-eunice",
    }).status,
    200,
  );
  assert.equal(
    decideSessionQuestionPdfAccess({
      role: "administrator",
      requesterUserId: "admin-1",
      sessionTutorUserId: "tutor-eunice",
    }).status,
    200,
  );
});

test("question PDFs number prompts, render math, and embed a figure without the answer key", () => {
  const questions = renderSessionQuestionPdf({ ...sample, includeAnswerKey: false });
  const text = questions.toString("latin1");
  assert.equal(questions.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(text, /Taito.s SAT Session with Eunice/);
  assert.match(text, /Student: Taito Goto/);
  assert.match(text, /Fri, Oct 16, 2026, 8:00 AM EDT/);
  assert.match(text, /\(1\.\)/);
  assert.match(text, /\(Solve\)/);
  assert.match(text, /\(3x\)/);
  assert.match(text, /\(2\)/);
  assert.match(text, /\(1\)/);
  assert.match(text, /\/Subtype \/Image/);
  assert.match(text, /\/Width 2/);
  assert.match(text, /\/Height 2/);
  assert.match(text, /\(Line\)/);
  assert.match(text, /\(through\)/);
  assert.doesNotMatch(text, /Square the known root/);
  assert.doesNotMatch(text, /Answer: B/);
});

test("answer-key PDFs include the correct choice and explanation", () => {
  const key = renderSessionQuestionPdf({ ...sample, includeAnswerKey: true });
  const text = key.toString("latin1");
  assert.match(text, /answer key/);
  assert.match(text, /\(Answer:\)/);
  assert.match(text, /\(B\)/);
  assert.match(text, /\(Square\)/);
  assert.match(text, /\(one-half\)/);
});

test("the download route is read-only and uses the tutor access check", async () => {
  const source = await readFile(new URL("../routes/platform.ts", import.meta.url), "utf8");
  const start = source.indexOf('"/sessions/:sessionId/question-pdf"');
  assert.ok(start > 0);
  const slice = source.slice(start, start + 3500);
  assert.match(slice, /decideSessionQuestionPdfAccess/);
  assert.match(slice, /renderSessionQuestionPdf/);
  assert.doesNotMatch(slice, /sendGuidance|sendEmail|insert\(attemptsTable|update\(attemptsTable/);
  const sessionStart = source.indexOf('router.get("/sessions/:sessionId"');
  const sessionSlice = source.slice(sessionStart, start);
  assert.match(sessionSlice, /submittedAt/);
  assert.match(
    sessionSlice,
    /role === "tutor" \|\| req\.appUser!\.role === "administrator"/,
  );
});
