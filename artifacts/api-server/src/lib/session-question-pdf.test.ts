import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { repairMichelleQuizMathText } from "./stacked-math-notation.ts";
import {
  decideSessionQuestionPdfAccess,
  helveticaTextWidth,
  readQuizFigure,
  renderSessionQuestionPdf,
  resolveQuizMediaRoot,
  selectSessionPdfSections,
  SESSION_PDF_CONTENT_WIDTH,
  SESSION_PDF_MARGIN,
  temporaryAliasMayDownloadAnswerKey,
  type SessionPdfAssignment,
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
  assert.match(slice, /phaseRaw === "" \|\| phaseRaw === "all"/);
  assert.match(slice, /selectSessionPdfSections/);
  const accessAt = slice.indexOf("decideSessionQuestionPdfAccess");
  const renderAt = slice.indexOf("renderSessionQuestionPdf");
  assert.ok(accessAt > 0 && renderAt > accessAt);
  assert.match(slice, /session\.clientUserId/);
  assert.match(slice, /attemptCount/);
  assert.match(slice, /planAssignmentId/);
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

function pdfTextRuns(pdf: Buffer): Array<{ page: number; x: number; y: number; size: number; text: string }> {
  const source = pdf.toString("latin1");
  const runs: Array<{ page: number; x: number; y: number; size: number; text: string }> = [];
  const pages = source.matchAll(/stream\n([\s\S]*?)\nendstream/g);
  let page = 0;
  for (const stream of pages) {
    const body = stream[1] ?? "";
    if (!body.includes("BT")) continue;
    page += 1;
    const pattern = /BT \/F\d+ ([\d.]+) Tf ([-\d.]+) ([-\d.]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g;
    for (const match of body.matchAll(pattern)) {
      runs.push({
        page,
        size: Number(match[1]),
        x: Number(match[2]),
        y: Number(match[3]),
        text: (match[4] ?? "").replace(/\\([()\\])/g, "$1"),
      });
    }
  }
  return runs;
}

function assertLinesFit(runs: Array<{ page: number; x: number; y: number; size: number; text: string }>) {
  const byLine = new Map<string, typeof runs>();
  for (const run of runs) {
    const key = `${run.page}:${run.y}`;
    const line = byLine.get(key) ?? [];
    line.push(run);
    byLine.set(key, line);
  }
  const rightLimit = SESSION_PDF_MARGIN + SESSION_PDF_CONTENT_WIDTH + 1;
  for (const line of byLine.values()) {
    const ordered = [...line].sort((left, right) => left.x - right.x);
    for (let index = 0; index < ordered.length; index += 1) {
      const run = ordered[index]!;
      const right = run.x + helveticaTextWidth(run.text, run.size);
      assert.ok(right <= rightLimit, `"${run.text}" ends at ${right}`);
      const next = ordered[index + 1];
      if (!next) continue;
      const end = run.x + helveticaTextWidth(run.text, run.size);
      assert.ok(next.x + 0.75 >= end, `"${run.text}" overlaps "${next.text}"`);
    }
  }
  return byLine.size;
}

test("a 1000-character passage wraps inside the content width without overprinting", () => {
  assert.equal(helveticaTextWidth("m", 1000), 833);
  assert.equal(helveticaTextWidth("i", 1000), 222);
  assert.equal(helveticaTextWidth("w", 1000), 722);
  const sentence = "A small archive digitized its handwritten maps and added searchable labels. ";
  let passage = "";
  while (passage.length < 1000) passage += sentence;
  passage = passage.slice(0, 1000);
  const pdf = renderSessionQuestionPdf({
    phase: "before_session",
    includeAnswerKey: false,
    sessionTitle: "Taito's SAT Session with Eunice",
    sessionDateLabel: "Fri, Oct 16, 2026",
    studentName: "Taito Goto",
    questions: [
      {
        prompt: "Read the passage.",
        stimulus: `${passage}\nLine two must not overprint line one.`,
      },
    ],
  });
  const body = pdfTextRuns(pdf).filter((run) => run.size === 11);
  const lineCount = assertLinesFit(body);
  assert.ok(lineCount >= 8, `expected the passage to wrap, saw ${lineCount} lines`);
  const maps = body.find((run) => run.text === "maps");
  const and = body.find((run) => run.text === "and" && maps && run.y === maps.y);
  assert.ok(maps);
  assert.ok(and);
  assert.ok(and!.x >= maps!.x + helveticaTextWidth("maps", maps!.size) - 0.2);
  const stays = body.find((run) => run.text === "searchable");
  const second = body.find((run) => run.text === "overprint");
  assert.ok(stays && second);
  assert.notEqual(stays!.y, second!.y);
});

test("session 37062b4f PDFs keep the bank, topic homework, and hard set apart", () => {
  const homeworkIds = ["hw-1", "hw-2", "hw-3", "hw-4"];
  const bankIds = Array.from({ length: 40 }, (_, index) => `bank-${index + 1}`);
  const hardIds = Array.from({ length: 21 }, (_, index) => `hard-${index + 1}`);
  const assignments: SessionPdfAssignment[] = [
    {
      id: "f00b3046",
      title: "SAT Homework — Evidence and Inference",
      deliveryPhase: "before_session",
      status: "published",
      createdAt: "2026-10-01T00:00:00.000Z",
      questions: homeworkIds.map((id, position) => ({ id, position })),
    },
    {
      id: "910009f3",
      title: "SAT pre-work (30–50 q)",
      deliveryPhase: "before_session",
      status: "published",
      createdAt: "2026-10-15T00:00:00.000Z",
      questions: bankIds.map((id, position) => ({ id, position })),
    },
    {
      id: "copied-prework",
      title: "In-session homework completion",
      deliveryPhase: "during_session",
      status: "published",
      createdAt: "2026-10-16T00:00:00.000Z",
      questions: [...homeworkIds, ...bankIds.slice(0, 11)].map((id, position) => ({ id, position })),
    },
    {
      id: "during-homework",
      title: "Session homework — unique set",
      deliveryPhase: "during_session",
      status: "published",
      createdAt: "2026-10-16T00:30:00.000Z",
      questions: [{ id: "unique-hw", position: 0 }],
    },
    {
      id: "hard-bank",
      title: "Hard-question bank — leftover time",
      deliveryPhase: "during_session",
      status: "published",
      createdAt: "2026-10-16T01:00:00.000Z",
      questions: hardIds.map((id, position) => ({ id, position })),
    },
    {
      id: "geometry-follow-up",
      title: "Geometry Area and Volume",
      deliveryPhase: "before_session",
      status: "published",
      createdAt: "2026-10-16T02:00:00.000Z",
      questions: [{ id: "geom-1", position: 0 }],
    },
  ];
  const prework = selectSessionPdfSections({ phase: "before_session", assignments });
  assert.deepEqual(
    prework.map((section) => [section.assignmentId, section.questionIds.length]),
    [
      ["910009f3", 40],
      ["f00b3046", 4],
    ],
  );
  const during = selectSessionPdfSections({ phase: "during_session", assignments });
  assert.deepEqual(during, [
    {
      assignmentId: "hard-bank",
      title: "Hard-question bank — leftover time",
      questionIds: hardIds,
    },
  ]);

  const homeworkPrompts = [
    "Which conclusion is best supported by the survey?",
    "Which choice best states the central idea of the text?",
    "What does the phrase measured optimism most nearly suggest?",
    "Which choice most logically completes the text?",
  ];
  const longPassage =
    "The general store was essential to daily life in the rural United States during the 1800s because it provided the supplies that the people living in nearby communities needed. Also, the store was a source of information. People socializing at the general store would share news and help spread it throughout their communities.";
  const questionById = new Map<string, { prompt: string; stimulus?: string }>();
  homeworkIds.forEach((id, index) => questionById.set(id, { prompt: homeworkPrompts[index]! }));
  bankIds.forEach((id, index) =>
    questionById.set(id, {
      prompt: `Bank question ${index + 1}`,
      stimulus: index === 4 ? longPassage : undefined,
    }),
  );
  hardIds.forEach((id, index) => questionById.set(id, { prompt: `Hard question ${index + 1}` }));

  const toSections = (
    plans: ReturnType<typeof selectSessionPdfSections>,
  ) =>
    plans.map((plan) => ({
      title: plan.title,
      questions: plan.questionIds.map((id) => questionById.get(id)!),
    }));
  const preworkPdf = renderSessionQuestionPdf({
    phase: "before_session",
    includeAnswerKey: false,
    sessionTitle: "Taito's SAT Session with Eunice",
    sessionDateLabel: "Fri, Oct 16, 2026, 9:00 PM GMT+9",
    studentName: "Taito Goto",
    sections: toSections(prework),
  });
  const preworkText = preworkPdf.toString("latin1");
  assert.ok(preworkText.indexOf("SAT pre-work") < preworkText.indexOf("Evidence and Inference"));
  assert.match(preworkText, /\(1\.\)/);
  assert.match(preworkText, /\(40\.\)/);
  assert.match(preworkText, /\(41\.\)/);
  assert.match(preworkText, /\(44\.\)/);
  assert.doesNotMatch(preworkText, /Hard question/);
  assert.doesNotMatch(preworkText, /Geometry Area/);
  const preworkRuns = pdfTextRuns(preworkPdf).filter((run) => run.size === 11 || run.size === 12);
  assertLinesFit(preworkRuns);
  const maps = preworkRuns.find((run) => run.text === "maps");
  assert.equal(maps, undefined);
  const news = preworkRuns.find((run) => run.text === "news");
  const andAfterNews = preworkRuns.find((run) => run.text === "and" && news && Math.abs(run.y - news.y) < 0.5);
  assert.ok(news && andAfterNews);
  assert.ok(andAfterNews!.x > news!.x + helveticaTextWidth("news", news!.size));

  const duringPdf = renderSessionQuestionPdf({
    phase: "during_session",
    includeAnswerKey: false,
    sessionTitle: "Taito's SAT Session with Eunice",
    sessionDateLabel: "Fri, Oct 16, 2026, 9:00 PM GMT+9",
    studentName: "Taito Goto",
    sections: toSections(during),
  });
  const duringText = duringPdf.toString("latin1");
  assert.match(duringText, /Hard-question bank/);
  assert.match(duringText, /\(1\.\)/);
  assert.match(duringText, /\(21\.\)/);
  assert.doesNotMatch(duringText, /Bank question/);
  assert.doesNotMatch(duringText, /best supported by the survey/);
  assert.doesNotMatch(duringText, /Evidence and Inference/);
  assertLinesFit(pdfTextRuns(duringPdf).filter((run) => run.size === 12));

  const combined = selectSessionPdfSections({ phase: "all", assignments });
  assert.deepEqual(
    combined.map((section) => section.assignmentId),
    ["910009f3", "f00b3046", "during-homework", "hard-bank", "geometry-follow-up"],
  );
  assert.deepEqual(
    combined.find((section) => section.assignmentId === "geometry-follow-up")?.questionIds,
    ["geom-1"],
  );
  questionById.set("unique-hw", { prompt: "Unique homework item" });
  const combinedPdf = renderSessionQuestionPdf({
    phase: "all",
    includeAnswerKey: true,
    sessionTitle: "Michelle's SAT Session with Xavier",
    sessionDateLabel: "Sun, Oct 25, 2026, 12:00 PM EDT",
    studentName: "Michelle",
    sections: [
      ...toSections(combined.filter((section) => section.assignmentId !== "geometry-follow-up")),
      {
        title: "Geometry Area and Volume",
        questions: [
          {
            prompt: "Find the volume of the prism.",
            correctAnswer: "12",
            explanation: "Use the prism formula.",
          },
        ],
      },
    ],
  });
  const combinedText = combinedPdf.toString("latin1");
  assert.match(combinedText, /Session questions/);
  assert.match(combinedText, /answer key/);
  assert.match(combinedText, /Geometry Area/);
  assert.match(combinedText, /\(Answer:\)/);
  assert.match(combinedText, /\(12\)/);
  assert.doesNotMatch(combinedText, /\\frac/);
});

test("pre-work keeps the attempted plan bank and prints duplicate topic homework once", () => {
  const planId = "bank-attempted";
  const questions = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, position: index }));
  const sections = selectSessionPdfSections({
    phase: "before_session",
    assignments: [
      {
        id: "bank-newer",
        title: "SAT pre-work (30–50 q)",
        deliveryPhase: "before_session",
        status: "published",
        subject: "SAT",
        createdAt: "2026-10-16T00:00:00.000Z",
        questionCount: 40,
        attemptCount: 0,
        planAssignmentId: planId,
        questions: questions("newer", 40),
      },
      {
        id: planId,
        title: "SAT pre-work (30–50 questions)",
        deliveryPhase: "before_session",
        status: "published",
        subject: "SAT",
        createdAt: "2026-10-01T00:00:00.000Z",
        questionCount: 40,
        attemptCount: 1,
        planAssignmentId: planId,
        questions: questions("attempted", 40),
      },
      {
        id: "topic-older",
        title: "SAT Homework — Evidence and Inference",
        deliveryPhase: "before_session",
        status: "published",
        subject: "SAT",
        createdAt: "2026-09-01T00:00:00.000Z",
        questionCount: 4,
        attemptCount: 1,
        planAssignmentId: planId,
        questions: questions("topic-a", 4),
      },
      {
        id: "topic-newer",
        title: "SAT Homework — Evidence and Inference",
        deliveryPhase: "before_session",
        status: "published",
        subject: "SAT",
        createdAt: "2026-10-02T00:00:00.000Z",
        questionCount: 4,
        attemptCount: 0,
        planAssignmentId: planId,
        questions: questions("topic-b", 4),
      },
    ],
  });
  assert.deepEqual(
    sections.map((section) => section.assignmentId),
    [planId, "topic-older"],
  );
  assert.deepEqual(sections[0]?.questionIds, questions("attempted", 40).map((item) => item.id));
  assert.equal(sections.filter((section) => section.title.includes("Evidence")).length, 1);
});

test("WinAnsi fractions and accents use Helvetica AFM widths, and bold titles wrap", () => {
  assert.equal(helveticaTextWidth("\u00bc", 1000), 834);
  assert.equal(helveticaTextWidth("\u00bd", 1000), 834);
  assert.equal(helveticaTextWidth("\u00be", 1000), 834);
  assert.equal(helveticaTextWidth("\u00a9", 1000), 737);
  assert.equal(helveticaTextWidth("\u00ae", 1000), 737);
  assert.equal(helveticaTextWidth("\u00c6", 1000), 1000);
  assert.equal(helveticaTextWidth("\u00e6", 1000), 889);
  assert.equal(helveticaTextWidth("\u00c9", 1000), 667);
  assert.equal(helveticaTextWidth("\u00e9", 1000), 556);
  assert.equal(helveticaTextWidth("\u00bd", 1000, true), 834);
  assert.equal(helveticaTextWidth("\u00c6", 1000, true), 1000);
  assert.equal(helveticaTextWidth("M", 1000, true), 833);
  assert.ok(helveticaTextWidth("W", 1000, true) > helveticaTextWidth("i", 1000, true));
  for (let code = 0xa0; code <= 0xff; code += 1) {
    const width = helveticaTextWidth(String.fromCharCode(code), 1000);
    assert.notEqual(width, 600, `U+${code.toString(16)} still uses the 600 default`);
    assert.ok(width > 0);
  }

  const title =
    "SAT Homework — Evidence and Inference for the October session with a very long assignment title that cannot fit on one line of this page";
  assert.ok(helveticaTextWidth(title, 13, true) > SESSION_PDF_CONTENT_WIDTH);
  const pdf = renderSessionQuestionPdf({
    phase: "before_session",
    includeAnswerKey: false,
    sessionTitle: "Taito's SAT Session with Eunice",
    sessionDateLabel: "Fri, Oct 16, 2026",
    studentName: "Taito Goto",
    sections: [{ title, questions: [{ prompt: "Only question" }] }],
  });
  const titles = pdfTextRuns(pdf).filter((run) => run.size === 13);
  assert.ok(titles.length >= 2, `bold title should wrap, saw ${titles.length} lines`);
  const rightLimit = SESSION_PDF_MARGIN + SESSION_PDF_CONTENT_WIDTH + 1;
  for (const run of titles) {
    const right = run.x + helveticaTextWidth(run.text, run.size, true);
    assert.ok(right <= rightLimit, `"${run.text}" ends at ${right}`);
  }
});
