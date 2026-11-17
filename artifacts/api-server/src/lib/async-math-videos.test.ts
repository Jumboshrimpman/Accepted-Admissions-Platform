import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  asyncMathVideosFlagEnabled,
  checkSubmission,
  creditBalance,
  deliveryDecision,
  dueAtForSubmission,
  isOverdue,
  MATH_VIDEO_FILE_MAX_BYTES,
  normalizeItems,
  parseGrantAmount,
  parseYouTubeUrl,
  requestFolderName,
  safeUploadFilename,
  studentMayView,
  uploadFileDecision,
  youtubeEmbedUrl,
} from "./async-math-videos.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  byteLimitStream,
  createDriveClient,
  DRIVE_FILE_SCOPE,
  DRIVE_FULL_SCOPE,
  driveConfigFromEnv,
  serviceAccountAssertion,
} from "./google-drive-uploads.ts";

const ID = "dQw4w9WgXcQ";

test("YouTube links: watch, youtu.be, shorts, embed, live, nocookie, mobile, bare host", () => {
  const inputs = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://youtu.be/${ID}?si=abcdef`,
    `https://youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `  www.youtube.com/watch?v=${ID}  `,
  ];
  for (const input of inputs) {
    const parsed = parseYouTubeUrl(input);
    assert.equal(parsed.ok, true, input);
    if (parsed.ok) {
      assert.equal(parsed.videoId, ID, input);
      assert.equal(parsed.url, `https://www.youtube.com/watch?v=${ID}`);
    }
  }
});

test("YouTube links: rejects other hosts, playlists, channels, and bad IDs", () => {
  for (const input of [
    "",
    "not a url",
    `https://vimeo.com/${ID}`,
    `https://evil.example/watch?v=${ID}`,
    `https://youtube.com.evil.example/watch?v=${ID}`,
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@acceptedadmissions",
    "https://youtu.be/short",
    `javascript:alert(1)//youtu.be/${ID}`,
    `ftp://youtu.be/${ID}`,
  ]) {
    assert.equal(parseYouTubeUrl(input).ok, false, input);
  }
  assert.match(youtubeEmbedUrl(ID), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
});

test("feature flag is off unless explicitly enabled", () => {
  assert.equal(asyncMathVideosFlagEnabled({}), false);
  assert.equal(asyncMathVideosFlagEnabled({ ASYNC_MATH_VIDEOS_ENABLED: "" }), false);
  assert.equal(asyncMathVideosFlagEnabled({ ASYNC_MATH_VIDEOS_ENABLED: "0" }), false);
  assert.equal(asyncMathVideosFlagEnabled({ ASYNC_MATH_VIDEOS_ENABLED: "false" }), false);
  assert.equal(asyncMathVideosFlagEnabled({ ASYNC_MATH_VIDEOS_ENABLED: "1" }), true);
  assert.equal(asyncMathVideosFlagEnabled({ ASYNC_MATH_VIDEOS_ENABLED: " TRUE " }), true);
});

test("student visibility needs the flag AND an enabled enrollment; there is no end date", () => {
  const enrollment = { enabled: true };
  assert.equal(studentMayView(false, enrollment), false);
  assert.equal(studentMayView(true, null), false);
  assert.equal(studentMayView(true, { ...enrollment, enabled: false }), false);
  assert.equal(studentMayView(true, enrollment), true);
});

test("48-hour due time and overdue flag", () => {
  const sent = new Date("2026-11-18T15:00:00Z");
  const due = dueAtForSubmission(sent);
  assert.equal(due.toISOString(), "2026-11-20T15:00:00.000Z");
  assert.equal(isOverdue({ status: "submitted", dueAt: due }, new Date("2026-11-20T15:00:01Z")), true);
  assert.equal(isOverdue({ status: "submitted", dueAt: due }, new Date("2026-11-20T14:59:59Z")), false);
  assert.equal(isOverdue({ status: "delivered", dueAt: due }, new Date("2026-11-25T00:00:00Z")), false);
});

test("credits: balance is the ledger sum; grants are whole, nonzero, and capped", () => {
  assert.equal(creditBalance([{ delta: 15 }, { delta: -3 }, { delta: -4 }, { delta: 4 }]), 12);
  assert.deepEqual(parseGrantAmount(15), { ok: true, credits: 15 });
  assert.deepEqual(parseGrantAmount("5"), { ok: true, credits: 5 });
  assert.deepEqual(parseGrantAmount(-2), { ok: true, credits: -2 });
  assert.equal(parseGrantAmount(0).ok, false);
  assert.equal(parseGrantAmount(1.5).ok, false);
  assert.equal(parseGrantAmount(101).ok, false);
  assert.equal(parseGrantAmount("abc").ok, false);
});

test("items: trims notes, caps at 10 questions and note length", () => {
  const ok = normalizeItems([{ text: "  Q12 from practice test 4 \r\n" }, { text: 3 }, null]);
  assert.deepEqual(ok, { ok: true, items: [{ text: "Q12 from practice test 4" }, { text: "" }, { text: "" }] });
  assert.equal(normalizeItems("nope").ok, false);
  assert.equal(normalizeItems(Array.from({ length: 11 }, () => ({ text: "x" }))).ok, false);
  assert.equal(normalizeItems([{ text: "x".repeat(2001) }]).ok, false);
});

test("submission: 3–10 questions, each with a note or photo, one credit each", () => {
  const three = [{ text: "a" }, { text: "" }, { text: "c" }];
  assert.deepEqual(checkSubmission({ items: three, fileItemIndexes: [1], balance: 15 }), {
    ok: true,
    questionCount: 3,
  });
  const two = checkSubmission({ items: three.slice(0, 2), fileItemIndexes: [1], balance: 15 });
  assert.equal(two.ok, false);
  if (!two.ok) assert.equal(two.code, "QUESTION_COUNT");
  const eleven = checkSubmission({
    items: Array.from({ length: 11 }, () => ({ text: "x" })),
    fileItemIndexes: [],
    balance: 50,
  });
  assert.equal(eleven.ok, false);
  const empty = checkSubmission({ items: three, fileItemIndexes: [], balance: 15 });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.error, /Question 2/);
  const orphan = checkSubmission({ items: three, fileItemIndexes: [1, 5], balance: 15 });
  assert.equal(orphan.ok, false);
  if (!orphan.ok) assert.equal(orphan.code, "ORPHAN_FILE");
  const broke = checkSubmission({ items: three, fileItemIndexes: [1], balance: 2 });
  assert.equal(broke.ok, false);
  if (!broke.ok) {
    assert.equal(broke.status, 402);
    assert.match(broke.error, /needs 3 question credits and you have 2/);
  }
});

test("uploads: images and PDFs up to 15 MB with a declared size", () => {
  const base = { contentType: "image/jpeg", contentLength: "2048", filename: "IMG_0001.JPG", itemIndex: 0, existingFiles: 0 };
  assert.deepEqual(uploadFileDecision(base), { ok: true, mimeType: "image/jpeg", bytes: 2048, filename: "IMG_0001.JPG" });
  assert.equal(uploadFileDecision({ ...base, contentType: "image/heic" }).ok, true);
  assert.equal(uploadFileDecision({ ...base, contentType: "application/pdf; charset=binary" }).ok, true);
  const svg = uploadFileDecision({ ...base, contentType: "image/svg+xml" });
  assert.equal(svg.ok, false);
  if (!svg.ok) assert.equal(svg.status, 415);
  const html = uploadFileDecision({ ...base, contentType: "text/html" });
  assert.equal(html.ok, false);
  const noLength = uploadFileDecision({ ...base, contentLength: undefined });
  assert.equal(noLength.ok, false);
  if (!noLength.ok) assert.equal(noLength.status, 411);
  const big = uploadFileDecision({ ...base, contentLength: String(MATH_VIDEO_FILE_MAX_BYTES + 1) });
  assert.equal(big.ok, false);
  if (!big.ok) assert.equal(big.status, 413);
  assert.equal(uploadFileDecision({ ...base, itemIndex: 10 }).ok, false);
  assert.equal(uploadFileDecision({ ...base, itemIndex: Number.NaN }).ok, false);
  assert.equal(uploadFileDecision({ ...base, existingFiles: 40 }).ok, false);
  assert.equal(safeUploadFilename('../../etc/"passwd"', "image/png"), ".._.._etc_passwd");
  assert.equal(safeUploadFilename("   ", "image/png"), "question.png");
});

test("delivery needs a submitted request with a video; the quiz can come later", () => {
  assert.equal(deliveryDecision({ status: "submitted", youtubeVideoId: ID, followUpAssignmentId: "a" }).ok, true);
  assert.equal(deliveryDecision({ status: "submitted", youtubeVideoId: null, followUpAssignmentId: "a" }).ok, false);
  assert.equal(deliveryDecision({ status: "submitted", youtubeVideoId: ID, followUpAssignmentId: null }).ok, true);
  assert.equal(deliveryDecision({ status: "delivered", youtubeVideoId: ID, followUpAssignmentId: "a" }).ok, false);
  assert.equal(deliveryDecision({ status: "draft", youtubeVideoId: ID, followUpAssignmentId: "a" }).ok, false);
});

test("Drive folder names are dated and short", () => {
  assert.equal(
    requestFolderName({
      createdAt: new Date("2026-11-18T12:00:00Z"),
      clientName: "Michelle Makarem",
      requestId: "3f2a9c1b-0000-4000-8000-000000000000",
    }),
    "2026-11-18 Michelle M · 3f2a9c1b",
  );
});

test("Drive config: unset means not configured; service account wins; OAuth reuses calendar client", () => {
  assert.equal(driveConfigFromEnv({}), null);
  assert.equal(driveConfigFromEnv({ GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN: "r" }), null);
  const oauth = driveConfigFromEnv({
    GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN: "r",
    GOOGLE_CALENDAR_CLIENT_ID: "cid",
    GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
  });
  assert.equal(oauth?.kind, "oauth_refresh_token");
  if (oauth?.kind === "oauth_refresh_token") {
    assert.equal(oauth.clientId, "cid");
    assert.equal(oauth.folderId, null);
  }
  const key = JSON.stringify({ client_email: "svc@x.iam.gserviceaccount.com", private_key: "pk" });
  const sa = driveConfigFromEnv({
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: Buffer.from(key).toString("base64"),
    GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN: "r",
    GOOGLE_CALENDAR_CLIENT_ID: "cid",
    GOOGLE_CALENDAR_CLIENT_SECRET: "secret",
  });
  assert.equal(sa?.kind, "service_account");
  if (sa?.kind === "service_account") assert.equal(sa.scope, DRIVE_FILE_SCOPE);
  const withFolder = driveConfigFromEnv({ GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: key, GOOGLE_DRIVE_UPLOAD_FOLDER_ID: "F1" });
  if (withFolder?.kind === "service_account") {
    assert.equal(withFolder.scope, DRIVE_FULL_SCOPE);
    assert.equal(withFolder.folderId, "F1");
  } else assert.fail("expected service account config");
  assert.equal(driveConfigFromEnv({ GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: "{broken" }), null);
});

test("service account assertion is a verifiable RS256 JWT with optional impersonation", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwt = serviceAccountAssertion({
    key: { client_email: "svc@x.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() },
    scope: DRIVE_FILE_SCOPE,
    subject: "admin@acceptedadmissions.org",
    nowSeconds: 1_800_000_000,
  });
  const [header, body, signature] = jwt.split(".");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${body}`);
  assert.equal(verifier.verify(publicKey, Buffer.from(signature!, "base64url")), true);
  const claims = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
  assert.equal(claims.sub, "admin@acceptedadmissions.org");
  assert.equal(claims.scope, DRIVE_FILE_SCOPE);
  assert.equal(claims.exp - claims.iat, 3600);
});

test("byte limit stream rejects bodies that are larger or smaller than declared", async () => {
  const exact = new Blob([new Uint8Array(5)]).stream().pipeThrough(byteLimitStream(5));
  assert.equal((await new Response(exact).arrayBuffer()).byteLength, 5);
  const tooBig = new Blob([new Uint8Array(6)]).stream().pipeThrough(byteLimitStream(5));
  await assert.rejects(new Response(tooBig).arrayBuffer());
  const tooSmall = new Blob([new Uint8Array(4)]).stream().pipeThrough(byteLimitStream(5));
  await assert.rejects(new Response(tooSmall).arrayBuffer());
});

test("Drive client: refresh-token sign-in, app-owned root folder, resumable streamed upload", async () => {
  const calls: { url: string; method: string; headers: Headers; body?: string; bytes?: number }[] = [];
  const fakeFetch = async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const method = init.method ?? "GET";
    let body: string | undefined;
    let bytes: number | undefined;
    if (init.body instanceof ReadableStream) {
      bytes = (await new Response(init.body).arrayBuffer()).byteLength;
    } else if (typeof init.body === "string") {
      body = init.body;
    }
    calls.push({ url, method, headers, body, bytes });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "tok", expires_in: 3600 });
    }
    if (url.includes("/drive/v3/files?q=") || (url.includes("/drive/v3/files?") && method === "GET")) {
      return Response.json({ files: [] });
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?supportsAllDrives") && method === "POST") {
      return Response.json({ id: JSON.parse(body!).name.startsWith("Accepted") ? "ROOT" : "SUB", webViewLink: "https://drive/x" });
    }
    if (url.includes("uploadType=resumable")) {
      return new Response(null, { status: 200, headers: { location: "https://upload.example/session/1" } });
    }
    if (url === "https://upload.example/session/1") {
      return Response.json({ id: "FILE1", webViewLink: "https://drive/file1" });
    }
    return new Response("unexpected", { status: 500 });
  };
  const client = createDriveClient(
    { kind: "oauth_refresh_token", clientId: "cid", clientSecret: "sec", refreshToken: "ref", folderId: null },
    fakeFetch as never,
  );
  const root = await client.ensureRootFolder();
  assert.equal(root, "ROOT");
  assert.equal(await client.ensureRootFolder(), "ROOT", "root folder is cached");
  const sub = await client.createFolder("2026-11-18 Michelle M · abc", root);
  assert.equal(sub.id, "SUB");
  const uploaded = await client.uploadStream({
    name: "Q1 - IMG.jpg",
    parentId: "SUB",
    mimeType: "image/jpeg",
    bytes: 3,
    body: new Blob([new Uint8Array([1, 2, 3])]).stream(),
  });
  assert.deepEqual(uploaded, { id: "FILE1", webViewLink: "https://drive/file1" });
  const tokenCalls = calls.filter((call) => call.url.startsWith("https://oauth2.googleapis.com/token"));
  assert.equal(tokenCalls.length, 1, "access token is reused");
  assert.match(tokenCalls[0]!.body!, /grant_type=refresh_token/);
  const start = calls.find((call) => call.url.includes("uploadType=resumable"))!;
  assert.equal(start.headers.get("authorization"), "Bearer tok");
  assert.equal(start.headers.get("x-upload-content-length"), "3");
  assert.deepEqual(JSON.parse(start.body!).parents, ["SUB"]);
  const put = calls.find((call) => call.url === "https://upload.example/session/1")!;
  assert.equal(put.method, "PUT");
  assert.equal(put.headers.get("content-length"), "3");
  assert.equal(put.bytes, 3);
});

test("migration 0090 is additive and journaled", () => {
  const sql = readFileSync(new URL("../../../../lib/db/drizzle/0090_async_math_video_requests.sql", import.meta.url), "utf8");
  const statements = sql.replace(/ON (DELETE|UPDATE) no action/g, "").replace(/^--.*$/gm, "");
  assert.doesNotMatch(statements, /\bDROP\b|\bTRUNCATE\b|\bDELETE\b|\bUPDATE\b|ALTER TABLE "(users|sessions|assignments|payments|credit_ledger)"/i);
  assert.doesNotMatch(statements, /INSERT INTO/i, "no student is enrolled by the migration");
  assert.doesNotMatch(statements, /offer_ends_at/, "no end date on the offer");
  const journal = JSON.parse(readFileSync(new URL("../../../../lib/db/drizzle/meta/_journal.json", import.meta.url), "utf8"));
  assert.ok(journal.entries.some((entry: { tag: string }) => entry.tag === "0090_async_math_video_requests"));
});
