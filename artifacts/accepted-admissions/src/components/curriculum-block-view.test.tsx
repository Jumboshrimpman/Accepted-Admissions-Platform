import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { CurriculumBlockView } from "./curriculum-block-view";

afterEach(() => {
  cleanup();
});

describe("CurriculumBlockView", () => {
  test("Factoring Notes is a downloadable PDF on the session page", () => {
    render(
      <CurriculumBlockView
        studentFacing
        block={{
          id: "block-notes",
          sessionId: "session-1",
          libraryAssetId: "asset-notes",
          kind: "external_link",
          position: 0,
          visibility: "both",
          status: "published",
          config: {
            title: "Factoring Notes",
            label: "Factoring Notes",
            text: "Factoring notes from this session. Download the PDF and keep it open while you practice.",
            html: "",
            url: "/media/factoring/xavier-factoring-notes.pdf",
            libraryAssetId: "asset-notes",
            libraryKind: "resource",
            seedKey: "xavier-factoring-notes",
          },
        }}
      />,
    );
    const link = screen.getByRole("link", { name: /Download Factoring Notes/i });
    expect(link.getAttribute("href")).toBe("/media/factoring/xavier-factoring-notes.pdf");
    expect(link.getAttribute("download")).toBe("xavier-factoring-notes.pdf");
  });
});
