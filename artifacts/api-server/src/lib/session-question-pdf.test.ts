import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { repairMichelleQuizMathText } from "./stacked-math-notation.ts";
import {
  decideSessionQuestionPdfAccess,
  readQuizFigure,
  renderSessionQuestionPdf,
  resolveQuizMediaRoot,
  temporaryAliasMayDownloadAnswerKey,
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
  const end = source.indexOf("async function listAssignmentsForUser", start);
  const slice = source.slice(start, end);
  assert.match(slice, /UUID_PATTERN\.test\(sessionId\)/);
  assert.match(slice, /status\(400\)/);
  assert.match(slice, /decideSessionQuestionPdfAccess/);
  assert.match(slice, /temporaryAliasMayDownloadAnswerKey/);
  assert.match(slice, /inArray\(assignmentQuestionsTable\.assignmentId/);
  assert.match(slice, /michelleQuizMathRepairEnabled/);
  assert.match(slice, /repairMichelleQuizMathText\(/);
  assert.doesNotMatch(slice, /repairStackedMath = false/);
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

test("the xsfam6 alias cannot download answer keys unless TEMP_NIKA_VIEW_EMAIL is set", () => {
  assert.equal(
    temporaryAliasMayDownloadAnswerKey({
      temporaryTutorAlias: "xsfam6@gmail.com",
      includeAnswerKey: true,
    }),
    false,
  );
  assert.equal(
    temporaryAliasMayDownloadAnswerKey({
      temporaryTutorAlias: "xsfam6@gmail.com",
      includeAnswerKey: true,
      configuredViewEmail: "off",
    }),
    false,
  );
  assert.equal(
    temporaryAliasMayDownloadAnswerKey({
      temporaryTutorAlias: "xsfam6@gmail.com",
      includeAnswerKey: false,
    }),
    true,
  );
  assert.equal(
    temporaryAliasMayDownloadAnswerKey({
      temporaryTutorAlias: "xsfam6@gmail.com",
      includeAnswerKey: true,
      configuredViewEmail: "xsfam6@gmail.com",
    }),
    true,
  );
  assert.equal(
    temporaryAliasMayDownloadAnswerKey({
      includeAnswerKey: true,
      configuredViewEmail: undefined,
    }),
    true,
  );
});

test("media root resolves from both src and dist to the public media folder", () => {
  const expected = path.resolve(
    import.meta.dirname,
    "../../../accepted-admissions/public/media",
  );
  assert.equal(
    resolveQuizMediaRoot(path.resolve(import.meta.dirname)),
    expected,
  );
  assert.equal(
    resolveQuizMediaRoot(path.resolve(import.meta.dirname, "../../dist/lib")),
    expected,
  );
  const previous = process.env.SESSION_QUESTION_PDF_MEDIA_ROOT;
  process.env.SESSION_QUESTION_PDF_MEDIA_ROOT = expected;
  try {
    assert.equal(resolveQuizMediaRoot("/tmp/unrelated"), expected);
  } finally {
    if (previous === undefined) delete process.env.SESSION_QUESTION_PDF_MEDIA_ROOT;
    else process.env.SESSION_QUESTION_PDF_MEDIA_ROOT = previous;
  }
});

test("loads a real /media PNG and refuses arbitrary https hosts", async () => {
  const bytes = await readQuizFigure(
    "/media/sat-bank/psat-10-practice-test-1/p01-draw1.png",
  );
  assert.ok(bytes);
  assert.equal(bytes[0], 0x89);
  assert.equal(bytes[1], 0x50);
  assert.equal(bytes[2], 0x4e);
  assert.equal(bytes[3], 0x47);
  const calls: Array<{ url: string; redirect?: string }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), redirect: init?.redirect });
    return new Response(figure, { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await readQuizFigure("https://evil.example/secret.png"), null);
    assert.equal(await readQuizFigure("/media/../package.json"), null);
    const own = await readQuizFigure("https://app.acceptedadmissions.org/figures/sample.png");
    assert.ok(own);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.redirect, "error");
    assert.match(calls[0]?.url ?? "", /app\.acceptedadmissions\.org/);
  } finally {
    globalThis.fetch = original;
  }
});

test("caps a streamed figure at 2 MB and rejects oversized PNG dimensions", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_500_000));
        controller.enqueue(new Uint8Array(1_000_000));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(
      await readQuizFigure("https://app.acceptedadmissions.org/figures/huge.png"),
      null,
    );
  } finally {
    globalThis.fetch = original;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(100_000, 0);
  ihdr.writeUInt32BE(100_000, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const oversized = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 1, 2, 3]))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const pdf = renderSessionQuestionPdf({
    ...sample,
    includeAnswerKey: false,
    questions: [
      {
        prompt: "Oversized figure",
        figures: [{ alt: "too big", bytes: oversized }],
      },
    ],
  });
  assert.doesNotMatch(pdf.toString("latin1"), /\/Subtype \/Image/);
  assert.match(pdf.toString("latin1"), /\(too\)/);
});

test("answer keys keep WinAnsi math symbols and repair real stacked bank strings", () => {
  const stacked = [
    "Choice A is correct. The given absolute value equation can be rewritten as two",
    "linear equations: x",
    "45",
    "48",
    "+",
    "=",
    " and 1 yard",
    "36 inches",
    "=",
  ].join("\n");
  const explanation = repairMichelleQuizMathText(stacked, true);
  assert.match(explanation, /x \+ 45 = 48/);
  assert.match(explanation, /1 yard = 36 inches/);
  const key = renderSessionQuestionPdf({
    phase: "during_session",
    includeAnswerKey: true,
    sessionTitle: "Michelle's SAT Session with Xavier",
    sessionDateLabel: "Fri, Oct 16, 2026",
    studentName: "Michelle Makarem",
    questions: [
      {
        prompt: "90° ≤ 2² × 3³ ÷ 4 ± 1 ≠ 5 ≥ 0 and a⁴ plus √9 and x − 1.",
        correctAnswer: "A",
        explanation,
      },
    ],
  });
  const text = key.toString("latin1");
  assert.match(text, /WinAnsiEncoding/);
  assert.ok(text.includes("90\u00b0"));
  assert.ok(text.includes("2\u00b2"));
  assert.ok(text.includes("3\u00b3"));
  assert.ok(text.includes("\u00d7"));
  assert.ok(text.includes("\u00f7"));
  assert.ok(text.includes("\u00b1"));
  assert.match(text, /<=/);
  assert.match(text, />=/);
  assert.match(text, /!=/);
  assert.match(text, /sqrt9/);
  assert.match(text, /\^4/);
  assert.match(text, /x \+ 45 = 48|(\(x\).{0,200}\(\+\).{0,80}\(45\).{0,80}\(=\).{0,80}\(48\))/s);
  assert.match(text, /36 inches|(\(36\).{0,80}\(inches\))/s);
});
