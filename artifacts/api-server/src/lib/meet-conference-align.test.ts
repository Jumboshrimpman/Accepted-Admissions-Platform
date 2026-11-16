import assert from "node:assert/strict";
import test from "node:test";

const {
  MEET_CONFERENCE_DIVERGED_MESSAGE,
  alignMeetingToConference,
  eventConferenceMeetUrl,
  replaceMeetUrlInText,
  reconcileCreatedMeetEvent,
} =
  // @ts-expect-error Native Node test execution requires the source extension.
  await import("./meet-conference-align.ts");

const ASE = "https://meet.google.com/ase-tqtz-ywj";
const RIH = "https://meet.google.com/rih-iayt-okb";
const XQQ = "https://meet.google.com/xqq-zivk-ewx";

test("eventConferenceMeetUrl prefers hangoutLink, then a video entry point", () => {
  assert.equal(
    eventConferenceMeetUrl({ hangoutLink: `${RIH}/` }),
    RIH,
  );
  assert.equal(
    eventConferenceMeetUrl({
      conferenceData: {
        entryPoints: [
          { entryPointType: "phone", uri: "tel:+1-555-0100" },
          { entryPointType: "video", uri: ASE },
        ],
      },
    }),
    ASE,
  );
  assert.equal(
    eventConferenceMeetUrl({
      conferenceData: { conferenceId: "xqq-zivk-ewx" },
    }),
    XQQ,
  );
  assert.equal(eventConferenceMeetUrl({ hangoutLink: "https://www.google.com/calendar/event?eid=abc" }), null);
});

test("alignMeetingToConference uses the real conference button when it differs from the intended room", () => {
  const aligned = alignMeetingToConference({
    intendedUrl: ASE,
    event: { hangoutLink: RIH, location: ASE, description: ASE },
  });
  assert.deepEqual(aligned, {
    meetUrl: RIH,
    intendedUrl: ASE,
    conferenceUrl: RIH,
    diverged: true,
  });
  assert.equal(
    alignMeetingToConference({
      intendedUrl: ASE,
      event: { hangoutLink: ASE },
    }).diverged,
    false,
  );
  assert.equal(
    alignMeetingToConference({
      intendedUrl: ASE,
      event: {},
    }).meetUrl,
    ASE,
  );
});

test("replaceMeetUrlInText swaps only the intended Meet URL", () => {
  assert.equal(replaceMeetUrlInText(ASE, ASE, RIH), RIH);
  assert.equal(
    replaceMeetUrlInText(`Join here: ${ASE}`, ASE, RIH),
    "Join here: https://meet.google.com/rih-iayt-okb",
  );
  assert.equal(replaceMeetUrlInText("", ASE, RIH), RIH);
});

test("reconcileCreatedMeetEvent logs divergence and patches location and description with sendUpdates=none", async () => {
  const patches: Array<{ path: string; body: unknown }> = [];
  const logs: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    patches.push({ path: url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(
      JSON.stringify({
        id: "evt-1",
        hangoutLink: RIH,
        location: RIH,
        description: RIH,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const result = await reconcileCreatedMeetEvent({
      accessToken: "token",
      calendarId: "primary",
      intendedUrl: ASE,
      event: {
        id: "evt-1",
        hangoutLink: RIH,
        location: ASE,
        description: ASE,
      },
      log: (fields, message) => logs.push({ fields, message }),
    });
    assert.equal(result.alignment.diverged, true);
    assert.equal(result.alignment.meetUrl, RIH);
    assert.equal(result.event.location, RIH);
    assert.equal(result.event.description, RIH);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.message, MEET_CONFERENCE_DIVERGED_MESSAGE);
    assert.equal(logs[0]?.fields.intendedUrl, ASE);
    assert.equal(logs[0]?.fields.conferenceUrl, RIH);
    assert.equal(patches.length, 1);
    assert.match(patches[0]!.path, /sendUpdates=none/);
    assert.deepEqual(patches[0]!.body, { location: RIH, description: RIH });
  } finally {
    globalThis.fetch = previous;
  }
});
