import assert from "node:assert/strict";
import test from "node:test";
import { quizMathPlain, quizShowsFormattedMath } from "./quiz-math.ts";

test("formatted math is limited to the authored follow-up quizzes", () => {
  assert.equal(quizShowsFormattedMath("Factoring Quiz"), true);
  assert.equal(quizShowsFormattedMath("SAT Math Problems"), true);
  assert.equal(quizShowsFormattedMath(" Practice quiz "), false);
  assert.equal(quizShowsFormattedMath("Geometry Area and Volume"), false);
  assert.equal(quizShowsFormattedMath(null), false);
});

test("factoring stems use superscripts and real minus signs", () => {
  assert.equal(quizMathPlain("x^2 + 3x - 18"), "x^{2} + 3x − 18");
  assert.equal(quizMathPlain("x^2 + 2x - 24"), "x^{2} + 2x − 24");
  assert.equal(quizMathPlain("9x^2 - 25"), "9x^{2} − 25");
  assert.equal(quizMathPlain("15x^3 - 25x^2"), "15x^{3} − 25x^{2}");
  assert.equal(quizMathPlain("14x^2y + 21xy^2"), "14x^{2}y + 21xy^{2}");
  assert.equal(quizMathPlain("x**2 + 3x − 18"), "x^{2} + 3x − 18");
  assert.equal(quizMathPlain("x² + 3x − 18"), "x^{2} + 3x − 18");
  assert.equal(quizMathPlain("Factor the given expression."), "Factor the given expression.");
  assert.equal(quizMathPlain("Factor the given expression completely."), "Factor the given expression completely.");
});

test("prose stays prose and math islands format inside a sentence", () => {
  assert.equal(
    quizMathPlain("If x^2 - y^2 = 56 and x - y = 4, what is the value of x + y?"),
    "If x^{2} − y^{2} = 56 and x − y = 4, what is the value of x + y?",
  );
  assert.equal(
    quizMathPlain("If m^2 - n^2 = 45 and m + n = 15, what is the value of m - n?"),
    "If m^{2} − n^{2} = 45 and m + n = 15, what is the value of m − n?",
  );
  assert.equal(
    quizMathPlain("y-intercept of (0, 17/5)"),
    "y-intercept of (0, \\frac{17}{5})",
  );
  assert.equal(
    quizMathPlain(
      "A movie theater sells two types of tickets: child tickets and adult tickets. The theater charges $8 for a child ticket and $14 for an adult ticket. The theater sold a total of 120 tickets one evening for a total of $1,410.",
    ),
    "A movie theater sells two types of tickets: child tickets and adult tickets. The theater charges $8 for a child ticket and $14 for an adult ticket. The theater sold a total of 120 tickets one evening for a total of $1,410.",
  );
  assert.equal(
    quizMathPlain(
      "A water tank currently holds three-fifths of its maximum capacity. If 45 gallons of water were added to the tank, it would hold 90% of its maximum capacity.",
    ),
    "A water tank currently holds three-fifths of its maximum capacity. If 45 gallons of water were added to the tank, it would hold 90% of its maximum capacity.",
  );
});

test("fractions, absolute value, and exponents on the right factor", () => {
  assert.equal(quizMathPlain("7π/4"), "\\frac{7π}{4}");
  assert.equal(quizMathPlain("5π/6"), "\\frac{5π}{6}");
  assert.equal(
    quizMathPlain("(21x^2 + 63x + 18) / (x + 3)"),
    "\\frac{(21x^{2} + 63x + 18)}{(x + 3)}",
  );
  assert.equal(
    quizMathPlain("[7x(3x + 9) + 2(3x + 9)] / (x + 3)"),
    "\\frac{[7x(3x + 9) + 2(3x + 9)]}{(x + 3)}",
  );
  assert.equal(
    quizMathPlain("8|x - 3| - 11|x - 3| = -48"),
    "8|x − 3| − 11|x − 3| = −48",
  );
  assert.equal(quizMathPlain("h(x) = 6(2)^x"), "h(x) = 6(2)^{x}");
  assert.equal(quizMathPlain("g(x) = 12(2)^x"), "g(x) = 12(2)^{x}");
  assert.equal(
    quizMathPlain("h(x) = (1/12)(1/2)^x"),
    "h(x) = (\\frac{1}{12})(\\frac{1}{2})^{x}",
  );
  assert.equal(quizMathPlain("h(x) = -12(-2)^x"), "h(x) = −12(−2)^{x}");
  assert.equal(quizMathPlain("(px - r)(x - s)"), "(px − r)(x − s)");
  assert.equal(quizMathPlain("b/p"), "\\frac{b}{p}");
  assert.equal(quizMathPlain("sqrt(x^2 + 1)"), "√(x^{2} + 1)");
  assert.equal(
    quizMathPlain("x^4 - 20x^2 + 64 = 0"),
    "x^{4} − 20x^{2} + 64 = 0",
  );
  assert.equal(
    quizMathPlain("p(x) = cx + k"),
    "p(x) = cx + k",
  );
});
