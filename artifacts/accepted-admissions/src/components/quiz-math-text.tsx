import type { ReactNode } from "react";
import { type MathExpr, segmentQuizMath } from "@/lib/quiz-math";

function renderExpr(expr: MathExpr): ReactNode {
  switch (expr.type) {
    case "num":
      return expr.text;
    case "var":
      return <span className="italic">{expr.name}</span>;
    case "pi":
      return "π";
    case "neg":
      return (
        <>
          −{renderExpr(expr.expr)}
        </>
      );
    case "add":
      return expr.terms.map((term, index) => {
        if (index === 0) return <span key={index}>{renderExpr(term)}</span>;
        if (term.type === "neg") {
          return (
            <span key={index}>
              {" − "}
              {renderExpr(term.expr)}
            </span>
          );
        }
        return (
          <span key={index}>
            {" + "}
            {renderExpr(term)}
          </span>
        );
      });
    case "mul":
      return expr.factors.map((factor, index) => (
        <span key={index}>
          {index > 0 && factor.explicit ? "·" : null}
          {renderExpr(factor.expr)}
        </span>
      ));
    case "div":
      return (
        <span
          data-testid="quiz-fraction"
          className="mx-0.5 inline-flex flex-col items-center align-middle leading-none"
        >
          <span className="border-b border-current px-1 pb-0.5">{renderExpr(expr.num)}</span>
          <span className="px-1 pt-0.5">{renderExpr(expr.den)}</span>
        </span>
      );
    case "pow":
      return (
        <>
          {renderExpr(expr.base)}
          <sup data-testid="quiz-sup" className="text-[0.75em]">
            {renderExpr(expr.exp)}
          </sup>
        </>
      );
    case "abs":
      return (
        <>
          |{renderExpr(expr.expr)}|
        </>
      );
    case "sqrt":
      return (
        <>
          √(
          {expr.expr.type === "group" && expr.expr.bracket === "(" && expr.expr.items.length === 1
            ? renderExpr(expr.expr.items[0]!)
            : renderExpr(expr.expr)}
          )
        </>
      );
    case "group": {
      const close = expr.bracket === "(" ? ")" : "]";
      return (
        <>
          {expr.bracket}
          {expr.items.map((item, index) => (
            <span key={index}>
              {index > 0 ? ", " : null}
              {renderExpr(item)}
            </span>
          ))}
          {close}
        </>
      );
    }
    case "eq":
      return (
        <>
          {renderExpr(expr.left)} = {renderExpr(expr.right)}
        </>
      );
    default:
      return null;
  }
}

export function QuizMathText({ text, className }: { text: string; className?: string }) {
  const segments = segmentQuizMath(text);
  return (
    <span data-testid="quiz-math-text" className={className}>
      {segments.map((segment, index) =>
        segment.type === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <span key={index} data-testid="quiz-math-expr">
            {renderExpr(segment.expr)}
          </span>
        ),
      )}
    </span>
  );
}
