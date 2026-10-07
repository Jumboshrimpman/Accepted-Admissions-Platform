import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardMaterialUrl,
  dashboardMaterialsFromBlocks,
  type DashboardMaterialBlock,
} from "./dashboard-materials.ts";

const FACTORING_NOTES_URL = "/media/factoring/xavier-factoring-notes.pdf";

function block(
  overrides: Partial<DashboardMaterialBlock> = {},
): DashboardMaterialBlock {
  return {
    id: "notes-1",
    sessionId: "session-latest",
    kind: "external_link",
    visibility: "both",
    status: "published",
    position: 2,
    config: {
      title: "Factoring Notes",
      label: "Factoring Notes",
      text: "Factoring notes from this session. Download the PDF and keep it open while you practice.",
      url: FACTORING_NOTES_URL,
      libraryKind: "resource",
      seedKey: "xavier-factoring-notes",
    },
    ...overrides,
  };
}

test("published session file blocks become dashboard materials", () => {
  const materials = dashboardMaterialsFromBlocks(
    [
      block(),
      block({
        id: "older-file",
        sessionId: "session-older",
        position: 0,
        kind: "file_link",
        config: {
          title: "Older packet",
          url: "https://example.com/packet.pdf",
          text: "Older packet",
        },
      }),
      block({
        id: "draft",
        status: "draft",
        config: { title: "Draft notes", url: "/media/draft.pdf" },
      }),
      block({
        id: "tutor-only",
        visibility: "tutor",
        config: { title: "Tutor key", url: "/media/key.pdf" },
      }),
      block({
        id: "callout",
        kind: "callout",
        config: { title: "Agenda", text: "Work problems", url: "" },
      }),
      block({
        id: "unfinished",
        config: {
          title: "Live plan",
          text: "The live plan handles the unfinished homework.",
          url: "/media/live.pdf",
        },
      }),
      block({
        id: "script",
        config: { title: "Bad link", url: "javascript:alert(1)" },
      }),
    ],
    { studentFacing: true, sessionOrder: ["session-older", "session-latest"] },
  );

  assert.deepEqual(
    materials.map((item) => item.id),
    ["notes-1", "older-file"],
  );
  assert.equal(materials[0]?.title, "Factoring Notes");
  assert.equal(materials[0]?.url, FACTORING_NOTES_URL);
  assert.equal(materials[0]?.kind, "external_link");
  assert.match(materials[0]?.description ?? "", /Download the PDF/);
  assert.equal(materials[1]?.kind, "file_link");
});

test("dashboard material urls allow site paths and http links only", () => {
  assert.equal(dashboardMaterialUrl(FACTORING_NOTES_URL), FACTORING_NOTES_URL);
  assert.equal(
    dashboardMaterialUrl("https://cdn.example.com/notes.pdf"),
    "https://cdn.example.com/notes.pdf",
  );
  assert.equal(dashboardMaterialUrl("//cdn.example.com/notes.pdf"), null);
  assert.equal(dashboardMaterialUrl("javascript:alert(1)"), null);
  assert.equal(dashboardMaterialUrl(""), null);
});
