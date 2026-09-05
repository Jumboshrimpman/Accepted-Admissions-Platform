import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE } from "@/lib/content-source-text";
import {
  TEMPLATE_DRAFTS_BUTTON_LABEL,
  TEMPLATE_DRAFTS_DESCRIPTION,
  TEMPLATE_DRAFTS_EXPERIMENTAL_LABEL,
  TEMPLATE_DRAFTS_HEADING,
} from "@/lib/template-drafts";

const mocks = vi.hoisted(() => ({
  createSource: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  getListContentSourcesQueryKey: (params?: { courseId: string }) => ["/api/content-sources", params],
  getListQuestionBankQueryKey: (params?: { courseId: string }) => ["/api/question-bank", params],
  useListContentSources: () => ({ data: [], isLoading: false }),
  useCreateContentSource: () => ({ mutate: mocks.createSource, isPending: false }),
  useGeneratePracticeQuestions: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQuestionBankItem: () => ({ mutate: vi.fn(), isPending: false }),
  useAttachQuestionToAssignment: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

import { GenerateDraftsCard } from "./question-bank-authoring";

afterEach(() => {
  cleanup();
  mocks.createSource.mockReset();
});

describe("curriculum source import validation", () => {
  test("blocks URL-only imports before submit and requires 40 characters of pasted text", () => {
    render(<GenerateDraftsCard courseId="course-1" onChanged={() => undefined} />);

    fireEvent.change(screen.getByLabelText("Source title"), {
      target: { value: "Evidence notes" },
    });
    fireEvent.change(screen.getByLabelText("Authorization note"), {
      target: { value: "Tutor-created handout owned by Accepted Admissions." },
    });
    fireEvent.change(screen.getByLabelText("Source URL (optional)"), {
      target: { value: "https://example.invalid/lesson" },
    });

    expect(screen.getByTestId("source-text-validation").textContent).toBe(
      SOURCE_EXTRACTED_TEXT_REQUIRED_MESSAGE,
    );
    expect((screen.getByRole("button", { name: "Import source" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Import source" }));
    expect(mocks.createSource).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Authorized extracted text"), {
      target: { value: "Authorized lesson notes about evidence, inference, and transferable examples." },
    });
    expect(screen.queryByTestId("source-text-validation")).toBeNull();
    expect((screen.getByRole("button", { name: "Import source" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  test("labels template drafts as experimental generic starting points", () => {
    render(<GenerateDraftsCard courseId="course-1" onChanged={() => undefined} />);

    expect(screen.getByText(TEMPLATE_DRAFTS_HEADING)).toBeTruthy();
    expect(screen.getByText(TEMPLATE_DRAFTS_EXPERIMENTAL_LABEL)).toBeTruthy();
    expect(screen.getByText(TEMPLATE_DRAFTS_DESCRIPTION)).toBeTruthy();
    expect(screen.getByRole("button", { name: TEMPLATE_DRAFTS_BUTTON_LABEL })).toBeTruthy();
    expect(screen.queryByText(/College Board/i)).toBeNull();
    expect(screen.queryByText(/\bAI\b/)).toBeNull();
  });
});
