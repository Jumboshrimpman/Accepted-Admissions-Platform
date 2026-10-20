import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isTaitoEnglishPacketSession,
  viewerMayDownloadEnglishPacket,
} from "./english-packet-downloads.ts";

const october = {
  dateTime: "2026-10-23T12:00:00.000Z",
  timezone: "Asia/Tokyo",
  subject: "IELTS",
  studentName: "Taito Goto",
};

test("Nika and admin can see Taito English packet sessions", () => {
  assert.equal(isTaitoEnglishPacketSession(october), true);
  assert.equal(
    isTaitoEnglishPacketSession({ ...october, dateTime: "2026-11-13T12:00:00.000Z", subject: "English" }),
    true,
  );
  assert.equal(
    isTaitoEnglishPacketSession({ ...october, dateTime: "2026-12-04T12:00:00.000Z", studentName: null }),
    true,
  );
  assert.equal(
    viewerMayDownloadEnglishPacket({ role: "tutor", email: "Nika.Raiffe@gmail.com" }) &&
      isTaitoEnglishPacketSession(october),
    true,
  );
  assert.equal(
    viewerMayDownloadEnglishPacket({ role: "administrator", email: "admin@acceptedadmissions.org" }),
    true,
  );
});

test("students, other tutors, and non-English sessions do not show the packet", () => {
  assert.equal(viewerMayDownloadEnglishPacket({ role: "student", email: "taito0525@gmail.com" }), false);
  assert.equal(viewerMayDownloadEnglishPacket({ role: "viewer", email: "parent@example.com" }), false);
  assert.equal(
    viewerMayDownloadEnglishPacket({ role: "tutor", email: "eunice_chon@berkeley.edu" }),
    false,
  );
  assert.equal(viewerMayDownloadEnglishPacket({ role: "tutor" }), false);
  assert.equal(isTaitoEnglishPacketSession({ ...october, subject: "SAT" }), false);
  assert.equal(
    isTaitoEnglishPacketSession({ ...october, studentName: "Michelle Makarem" }),
    false,
  );
  assert.equal(
    isTaitoEnglishPacketSession({ ...october, dateTime: "2026-10-30T12:00:00.000Z" }),
    false,
  );
});

test("the student portal does not offer English packet downloads", async () => {
  const portalSession = await readFile(new URL("../pages/portal/session.tsx", import.meta.url), "utf8");
  const portalDashboard = await readFile(
    new URL("../pages/portal/fall-welcome-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(portalSession, /EnglishPacketDownloads|english-packet-pdf/);
  assert.doesNotMatch(portalDashboard, /EnglishPacketDownloads|english-packet-pdf/);
});
