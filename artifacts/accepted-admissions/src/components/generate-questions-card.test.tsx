import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GenerateQuestionsCard } from "./generate-questions-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Generate questions on an open quiz", () => {
  test("shows an honest blocked state when no provider is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          available: false,
          provider: null,
          model: null,
          requiredEnv: ["OPENAI_API_KEY"],
          message: "Generate questions needs OPENAI_API_KEY on the API host.",
        }),
      })),
    );
    render(<GenerateQuestionsCard assignmentId="quiz-1" onGenerated={() => undefined} />);
    expect(await screen.findByTestId("generate-questions-blocked")).toBeTruthy();
    expect(screen.getAllByText(/OPENAI_API_KEY/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("generate-questions-submit")).toBeNull();
  });

  test("submits count, source, skill, and difficulty to the open quiz", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (String(input).includes("/question-generation") && !String(input).includes("generate-questions")) {
        return {
          ok: true,
          json: async () => ({
            available: true,
            provider: "openai",
            model: "gpt-4o-mini",
            requiredEnv: ["OPENAI_API_KEY"],
            message: "OpenAI is configured.",
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ questions: [{ id: "q-new", prompt: "Generated prompt" }] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const onGenerated = vi.fn();
    render(<GenerateQuestionsCard assignmentId="quiz-1" defaultSkill="Evidence" onGenerated={onGenerated} />);
    expect(await screen.findByTestId("generate-questions-submit")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("How many questions"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Optional source material"), {
      target: { value: "Authorized notes about evidence and inference." },
    });
    fireEvent.click(screen.getByTestId("generate-questions-submit"));
    await waitFor(() => expect(onGenerated).toHaveBeenCalled());
    const generateCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/assignments/quiz-1/generate-questions"));
    expect(generateCall?.[1]?.body).toContain('"count":4');
    expect(generateCall?.[1]?.body).toContain("Authorized notes");
  });
});
