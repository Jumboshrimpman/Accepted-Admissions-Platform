import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("students and viewers never get session question PDF controls", async () => {
  const portalSession = await readFile(new URL("../pages/portal/session.tsx", import.meta.url), "utf8");
  const portalDashboard = await readFile(
    new URL("../pages/portal/fall-welcome-dashboard.tsx", import.meta.url),
    "utf8",
  );
  const studentPattern =
    /SessionQuestionDownloads|english-packet-pdf|question-pdf|Download questions \(PDF\)|Download answer key \(PDF\)/;
  assert.doesNotMatch(portalSession, studentPattern);
  assert.doesNotMatch(portalDashboard, studentPattern);
});
