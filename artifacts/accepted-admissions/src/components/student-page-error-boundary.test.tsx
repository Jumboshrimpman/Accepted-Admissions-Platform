import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ErrorBoundary, StudentPageErrorFallback } from "./error-boundary";

afterEach(cleanup);

function Boom(): never {
  throw new Error("quiz render failed");
}

describe("student page error boundary", () => {
  it("shows a reload action instead of a blank student page", () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args[0]);
    };
    try {
      render(
        <ErrorBoundary FallbackComponent={StudentPageErrorFallback}>
          <Boom />
        </ErrorBoundary>,
      );
    } finally {
      console.error = original;
    }

    expect(screen.getByTestId("student-page-error").textContent).toMatch(/ran into a problem/i);
    expect(screen.getByTestId("student-page-reload").textContent).toBe("Reload");
    expect(screen.queryByText("quiz render failed")).toBeNull();
  });
});
