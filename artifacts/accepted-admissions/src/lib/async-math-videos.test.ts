import assert from "node:assert/strict";
import test from "node:test";
import {
  assignPhotosToQuestions,
  canPreviewInline,
  dueLabel,
  submitReadiness,
  uploadMimeType,
  uploadProblem,
  youtubeVideoIdFromUrl,
} from "./async-math-videos.ts";

test("HEIC photos with an empty browser type still upload as HEIC", () => {
  assert.equal(uploadMimeType({ name: "IMG_2041.HEIC", type: "" }), "image/heic");
  assert.equal(uploadMimeType({ name: "scan.pdf", type: "application/pdf" }), "application/pdf");
  assert.equal(uploadMimeType({ name: "photo.jpg", type: "image/jpeg" }), "image/jpeg");
  assert.equal(uploadMimeType({ name: "notes.docx", type: "" }), null);
  assert.equal(uploadMimeType({ name: "vector.svg", type: "image/svg+xml" }), null);
});

test("upload problems: type and 15 MB cap", () => {
  assert.equal(uploadProblem({ name: "a.jpg", type: "image/jpeg", size: 2_000_000 }), null);
  assert.match(uploadProblem({ name: "a.jpg", type: "image/jpeg", size: 16 * 1024 * 1024 }) ?? "", /15 MB/);
  assert.match(uploadProblem({ name: "a.txt", type: "text/plain", size: 10 }) ?? "", /photos/);
  assert.match(uploadProblem({ name: "a.jpg", type: "image/jpeg", size: 0 }) ?? "", /empty/);
  assert.equal(canPreviewInline("image/heic"), false);
  assert.equal(canPreviewInline("image/png"), true);
});

test("bulk photos fill empty questions first, then add questions up to 10", () => {
  const items = [
    { text: "Q from test 3", fileCount: 0 },
    { text: "", fileCount: 0 },
    { text: "", fileCount: 1 },
  ];
  assert.deepEqual(assignPhotosToQuestions({ items, photoCount: 3, maxQuestions: 10 }), {
    targets: [1, 3, 4],
    itemCount: 5,
  });
  const full = Array.from({ length: 9 }, () => ({ text: "x", fileCount: 0 }));
  assert.deepEqual(assignPhotosToQuestions({ items: full, photoCount: 3, maxQuestions: 10 }), {
    targets: [9, null, null],
    itemCount: 10,
  });
});

test("submit readiness mirrors the server rules", () => {
  const base = { credits: 15, minQuestions: 3, maxQuestions: 10, uploading: false };
  const three = [
    { text: "a", fileCount: 0 },
    { text: "", fileCount: 2 },
    { text: "c", fileCount: 0 },
  ];
  assert.deepEqual(submitReadiness({ ...base, items: three }), { ready: true, count: 3, reason: null });
  assert.match(submitReadiness({ ...base, items: three.slice(0, 2) }).reason ?? "", /at least 3/);
  assert.match(submitReadiness({ ...base, items: [...three, { text: " ", fileCount: 0 }] }).reason ?? "", /Question 4/);
  assert.match(submitReadiness({ ...base, items: three, credits: 2 }).reason ?? "", /uses 3 credits and you have 2/);
  assert.match(submitReadiness({ ...base, items: three, uploading: true }).reason ?? "", /finish uploading/);
});

test("due label counts down and flags overdue", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  assert.equal(dueLabel("2026-11-20T12:00:00Z", now), "Due in 48 hours");
  assert.equal(dueLabel("2026-11-18T12:30:00Z", now), "Due in 30 minutes");
  assert.equal(dueLabel("2026-11-18T10:00:00Z", now), "Overdue by 2 hours");
  assert.equal(dueLabel(null, now), "");
});

test("YouTube preview parser accepts common share links and rejects others", () => {
  for (const url of [
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "www.youtube.com/embed/dQw4w9WgXcQ",
  ]) {
    assert.equal(youtubeVideoIdFromUrl(url), "dQw4w9WgXcQ", url);
  }
  assert.equal(youtubeVideoIdFromUrl("https://vimeo.com/1234"), null);
  assert.equal(youtubeVideoIdFromUrl("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeVideoIdFromUrl("https://www.youtube.com/playlist?list=PL1"), null);
});
