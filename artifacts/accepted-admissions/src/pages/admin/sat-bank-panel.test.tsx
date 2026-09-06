import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const importMutate = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  getListSatBankCollectionsQueryKey: () => ["/api/admin/sat-bank/collections"],
  getListSatBankQuestionsQueryKey: () => ["/api/admin/sat-bank/questions"],
  getGetSatBankCollectionQueryKey: (id: string) => ["/api/admin/sat-bank/collections", id],
  useListSatBankCollections: () => ({
    data: [
      {
        id: "col-11",
        title: "SAT Practice Test 11",
        slug: "sat-practice-test-11",
        examFamily: "sat",
        extractStatus: "partial",
        questionCount: 1,
        officialExplanationCount: 0,
        assets: [],
      },
    ],
  }),
  useListSatBankQuestions: () => ({ data: [{ id: "q1" }] }),
  useGetSatBankCollection: () => ({
    data: {
      id: "col-11",
      title: "SAT Practice Test 11",
      slug: "sat-practice-test-11",
      examFamily: "sat",
      extractStatus: "partial",
      questionCount: 1,
      officialExplanationCount: 0,
      assets: [
        {
          id: "a1",
          kind: "test_pdf",
          title: "Test PDF",
          resourceUrl: "content/college-board/sat/practice-test-11/test.pdf",
        },
      ],
      questions: [
        {
          id: "bq1",
          sourceKey: "sat:11:rw:1:1",
          collectionId: "col-11",
          examFamily: "sat",
          section: "rw",
          module: 1,
          questionNumber: 1,
          position: 1,
          prompt: "Which choice most logically completes the text?",
          skill: "Command of Evidence",
          domain: "Information and Ideas",
          difficulty: "medium",
          questionType: "mcq",
          estimatedSeconds: 450,
          sourceKind: "seed",
          hasOfficialExplanation: false,
        },
      ],
    },
    isLoading: false,
  }),
  useImportSatBank: () => ({ mutate: importMutate, isPending: false }),
  useAssignSatBankPrework: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { AssignBankPreworkControl, SatBankPanel } from "./sat-bank-panel";

afterEach(() => {
  cleanup();
  importMutate.mockReset();
});

describe("SAT/PSAT bank panel", () => {
  test("browses a source collection in original order without claiming official OCR is done", () => {
    render(<SatBankPanel collectionId="col-11" onOpenCollection={() => undefined} />);
    expect(screen.getByTestId("sat-bank-panel").textContent).toMatch(/SAT\/PSAT question bank/);
    expect(screen.getByTestId("sat-bank-collection-sat-practice-test-11").textContent).toMatch(
      /SAT Practice Test 11/,
    );
    expect(screen.getByTestId("sat-bank-question-sat:11:rw:1:1").textContent).toMatch(
      /Which choice most logically completes the text/,
    );
    expect(screen.getByText(/official explanation pending/i)).toBeTruthy();
    expect(screen.getByText(/Seed fixture/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("import-sat-bank"));
    expect(importMutate).toHaveBeenCalled();
  });

  test("assigns 60-minute session pre-work as routine accuracy work, not an official SAT score", () => {
    render(
      <AssignBankPreworkControl
        sessionId="session-1"
        collections={[{ id: "col-11", title: "SAT Practice Test 11", questionCount: 1 }]}
        onChanged={() => undefined}
      />,
    );
    expect(screen.getByTestId("assign-bank-prework-session-1").textContent).toMatch(
      /60-minute bank pre-work/,
    );
    expect(screen.getByLabelText("Homework type").textContent).toMatch(/Routine \(no SAT score\)/);
    expect(screen.getByRole("button", { name: /Assign 60-min pre-work/ })).toBeTruthy();
  });
});
