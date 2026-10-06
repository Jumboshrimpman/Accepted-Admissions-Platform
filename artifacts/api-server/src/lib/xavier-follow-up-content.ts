import {
  FACTORING_QUIZ_FOLLOW_UP_TITLE,
  SAT_MATH_FOLLOW_UP_TITLE,
} from "./post-session-follow-up.ts";

export { FACTORING_QUIZ_FOLLOW_UP_TITLE, SAT_MATH_FOLLOW_UP_TITLE };

/** 22 questions × 1.5 minutes. */
export const SAT_MATH_FOLLOW_UP_TIME_LIMIT_MINUTES = 33;

/** 26 questions × 1.5 minutes. */
export const FACTORING_QUIZ_TIME_LIMIT_MINUTES = 39;

export const SAT_MATH_FOLLOW_UP_TAG = "xavier-sat-math-follow-up";
export const FACTORING_QUIZ_FOLLOW_UP_TAG = "xavier-factoring-quiz-follow-up";

/**
 * Authored follow-up items are not College Board OCR. The student-usable
 * gate drops every grid-in, so serving and scoring check this tag instead.
 */
export const XAVIER_AUTHORED_FOLLOW_UP_TAG = "xavier-authored-follow-up";

export const FACTORING_NOTES_TITLE = "Factoring Notes";
export const FACTORING_NOTES_SEED_KEY = "xavier-factoring-notes";
export const FACTORING_NOTES_PUBLIC_PATH = "/media/factoring/xavier-factoring-notes.pdf";
export const FACTORING_NOTES_DESCRIPTION =
  "Factoring notes from this session. Download the PDF and keep it open while you practice.";

export const SAT_MATH_FOLLOW_UP_INSTRUCTIONS =
  "SAT Math practice assigned after your session. Problems 5A, 5B, 6A, and 6B are included, then every version of problems 7 through 12. The original problems 5 and 6 are not included. For a grid-in, type a number or expression. Use ^ for an exponent (x^2) and a hyphen for a negative. Your score is the percent correct. You have 33 minutes.";

export const FACTORING_QUIZ_INSTRUCTIONS =
  "Factoring practice assigned after your session. Practice A and Practice B are included for every set. The examples you worked in session are not included. For a factored answer, either factor order is accepted. Use ^ for an exponent (x^2) and a hyphen for a negative. Your score is the percent correct. You have 39 minutes.";

export type FollowUpChoice = { id: string; label: string; text: string };

export type FollowUpQuestionDraft = {
  sourceKey: string;
  skill: string;
  difficulty: "medium" | "hard";
  questionType: "multiple_choice" | "spr";
  prompt: string;
  choices: FollowUpChoice[];
  correctAnswer: string;
};

const choice = (id: string, text: string): FollowUpChoice => ({
  id,
  label: id.toUpperCase(),
  text,
});

function mc(
  sourceKey: string,
  skill: string,
  difficulty: "medium" | "hard",
  prompt: string,
  choices: readonly [string, string, string, string],
  correctAnswer: "a" | "b" | "c" | "d",
): FollowUpQuestionDraft {
  return {
    sourceKey,
    skill,
    difficulty,
    questionType: "multiple_choice",
    prompt,
    choices: choices.map((text, index) => choice("abcd"[index]!, text)),
    correctAnswer,
  };
}

function spr(
  sourceKey: string,
  skill: string,
  difficulty: "medium" | "hard",
  prompt: string,
  correctAnswer: string,
): FollowUpQuestionDraft {
  return {
    sourceKey,
    skill,
    difficulty,
    questionType: "spr",
    prompt,
    choices: [],
    correctAnswer,
  };
}

/** Both factor orders, plus the monomial written with or without parentheses. */
export function factorOrderAnswers(monomial: string, binomial: string): string {
  const left = monomial.replace(/\s+/g, "");
  const right = binomial.replace(/\s+/g, "");
  const wrappedLeft = left.startsWith("(") ? left : `(${left})`;
  const wrappedRight = right.startsWith("(") ? right : `(${right})`;
  return [
    `${left}${wrappedRight}`,
    `${wrappedLeft}${wrappedRight}`,
    `${wrappedRight}${wrappedLeft}`,
    `${wrappedRight}${left}`,
  ]
    .filter((form, index, all) => all.indexOf(form) === index)
    .join("; ");
}

/**
 * Set 10's printed key is 4, 6, and 5. Each is 1 greater than c from the
 * problem as written: q(0) gives k, then c = (c + k) - k.
 * Original: k + 8 = 17/5, c + k = -8/5 → c = 3.
 * Practice A: k - 3 = -9/2, c + k = 7/2 → c = 5.
 * Practice B: k + 5 = 10/3, c + k = 7/3 → c = 4.
 */
export const SAT_MATH_SET_10_ANSWERS = { original: "3", practiceA: "5", practiceB: "4" } as const;

export const SAT_MATH_FOLLOW_UP_QUESTIONS: readonly FollowUpQuestionDraft[] = [
  spr(
    "sat-5a",
    "linear equations",
    "medium",
    "A movie theater sells two types of tickets: child tickets and adult tickets. The theater charges $8 for a child ticket and $14 for an adult ticket. The theater sold a total of 120 tickets one evening for a total of $1,410. How many adult tickets did the theater sell?",
    "75",
  ),
  spr(
    "sat-5b",
    "linear equations",
    "medium",
    "A farmers market sells two sizes of strawberry baskets: small and large. The market charges $6 for a small basket and $10 for a large basket. The market sold a total of 85 baskets one day for a total of $650. How many large baskets did the market sell?",
    "35",
  ),
  mc(
    "sat-6a",
    "percent",
    "medium",
    "A water tank currently holds three-fifths of its maximum capacity. If 45 gallons of water were added to the tank, it would hold 90% of its maximum capacity. What is the maximum capacity, in gallons, of the tank?",
    ["50", "100", "150", "225"],
    "c",
  ),
  mc(
    "sat-6b",
    "percent",
    "medium",
    "A parking garage is currently filled to one-half of its maximum capacity. If 60 more cars parked in the garage, it would be filled to 80% of its maximum capacity. What is the maximum capacity, in cars, of the garage?",
    ["120", "200", "240", "300"],
    "b",
  ),
  spr(
    "sat-7",
    "absolute value equations",
    "hard",
    `8|x - 3| - 11|x - 3| = -48

What is the negative solution to the given equation?`,
    "-13",
  ),
  spr(
    "sat-7a",
    "absolute value equations",
    "hard",
    `5|x + 2| - 9|x + 2| = -28

What is the negative solution to the given equation?`,
    "-9",
  ),
  spr(
    "sat-7b",
    "absolute value equations",
    "hard",
    `3|x - 6| - 10|x - 6| = -63

What is the negative solution to the given equation?`,
    "-3",
  ),
  spr(
    "sat-8",
    "circle geometry",
    "medium",
    "A certain circle has center O, and points R and S lie on the circle. In triangle ORS, the measure of angle ROS is 88 degrees. What is the measure of angle RSO, in degrees?",
    "46",
  ),
  spr(
    "sat-8a",
    "circle geometry",
    "medium",
    "A certain circle has center P, and points A and B lie on the circle. In triangle PAB, the measure of angle APB is 52 degrees. What is the measure of angle PAB, in degrees?",
    "64",
  ),
  spr(
    "sat-8b",
    "circle geometry",
    "medium",
    "A certain circle has center C, and points M and N lie on the circle. In triangle CMN, the measure of angle CMN is 35 degrees. What is the measure of angle MCN, in degrees?",
    "110",
  ),
  mc(
    "sat-9",
    "trigonometry",
    "medium",
    "Angle A has a measure of 7π/4 radians. Angle B has a measure that is 5π/6 radians less than the measure of angle A. What is the measure of angle B, in degrees?",
    ["150", "165", "315", "330"],
    "b",
  ),
  mc(
    "sat-9a",
    "trigonometry",
    "medium",
    "Angle A has a measure of 5π/3 radians. Angle B has a measure that is π/4 radians less than the measure of angle A. What is the measure of angle B, in degrees?",
    ["210", "255", "300", "345"],
    "b",
  ),
  mc(
    "sat-9b",
    "trigonometry",
    "medium",
    "Angle P has a measure of 3π/2 radians. Angle Q has a measure that is 2π/5 radians less than the measure of angle P. What is the measure of angle Q, in degrees?",
    ["72", "162", "198", "342"],
    "c",
  ),
  spr(
    "sat-10",
    "linear functions",
    "hard",
    `p(x) = cx + k
q(x) = p(x) + 8

Function p is defined as shown, where c and k are constants, and the sum of c and k is -8/5. If function q has a y-intercept of (0, 17/5) when graphed in the xy-plane, what is the value of c?`,
    SAT_MATH_SET_10_ANSWERS.original,
  ),
  spr(
    "sat-10a",
    "linear functions",
    "hard",
    `p(x) = cx + k
q(x) = p(x) - 3

Function p is defined as shown, where c and k are constants, and the sum of c and k is 7/2. If function q has a y-intercept of (0, -9/2) when graphed in the xy-plane, what is the value of c?`,
    SAT_MATH_SET_10_ANSWERS.practiceA,
  ),
  spr(
    "sat-10b",
    "linear functions",
    "hard",
    `p(x) = cx + k
q(x) = p(x) + 5

Function p is defined as shown, where c and k are constants, and the sum of c and k is 7/3. If function q has a y-intercept of (0, 10/3) when graphed in the xy-plane, what is the value of c?`,
    SAT_MATH_SET_10_ANSWERS.practiceB,
  ),
  mc(
    "sat-11",
    "quadratic factoring",
    "hard",
    `3x^2 - bx + 14

The given expression, where b is a constant, can be rewritten as (px - r)(x - s), where p, r, and s are integer constants. Which of the following must be an integer?`,
    ["b/p", "b/r", "14/p", "14/r"],
    "d",
  ),
  mc(
    "sat-11a",
    "quadratic factoring",
    "hard",
    `5x^2 - bx + 21

The given expression, where b is a constant, can be rewritten as (px - r)(x - s), where p, r, and s are integer constants. Which of the following must be an integer?`,
    ["b/p", "b/r", "21/p", "21/s"],
    "d",
  ),
  mc(
    "sat-11b",
    "quadratic factoring",
    "hard",
    `2x^2 + bx + 15

The given expression, where b is a constant, can be rewritten as (px + r)(x + s), where p, r, and s are integer constants. Which of the following must be an integer?`,
    ["15/r", "b/p", "b/s", "15/p"],
    "a",
  ),
  mc(
    "sat-12",
    "exponential functions",
    "medium",
    "The exponential function g is defined by g(x) = 12(2)^x, and function h is defined by h(x) = g(x - 1). What equation could define function h?",
    ["h(x) = -12(-2)^x", "h(x) = -12(2)^x", "h(x) = (1/12)(1/2)^x", "h(x) = 6(2)^x"],
    "d",
  ),
  mc(
    "sat-12a",
    "exponential functions",
    "medium",
    "The exponential function g is defined by g(x) = 15(3)^x, and function h is defined by h(x) = g(x - 1). What equation could define function h?",
    ["h(x) = 45(3)^x", "h(x) = 5(3)^x", "h(x) = -15(3)^x", "h(x) = 15(-3)^x"],
    "b",
  ),
  mc(
    "sat-12b",
    "exponential functions",
    "medium",
    "The exponential function g is defined by g(x) = 8(4)^x, and function h is defined by h(x) = g(x + 1). What equation could define function h?",
    ["h(x) = 2(4)^x", "h(x) = -8(-4)^x", "h(x) = 32(4)^x", "h(x) = (1/8)(1/4)^x"],
    "c",
  ),
];

export const FACTORING_QUIZ_QUESTIONS: readonly FollowUpQuestionDraft[] = [
  mc(
    "fac-1a",
    "equivalent expressions",
    "medium",
    `[7x(3x + 9) + 2(3x + 9)] / (x + 3)

For all positive values of x, which of the following is equivalent to the given expression?`,
    ["21x + 6", "(7x + 2) / (x + 3)", "(21x^2 + 63x + 18) / (x + 3)", "(21x^2 + 69x + 2) / (x + 3)"],
    "a",
  ),
  mc(
    "fac-1b",
    "equivalent expressions",
    "medium",
    `[2x(10x + 15) - 5(10x + 15)] / (2x + 3)

For all positive values of x, which of the following is equivalent to the given expression?`,
    ["(2x - 5) / (2x + 3)", "(20x^2 + 30x - 75) / (2x + 3)", "(20x^2 - 20x + 75) / (2x + 3)", "10x - 25"],
    "d",
  ),
  spr(
    "fac-2a",
    "absolute value equations",
    "medium",
    `9|x + 1| - 14|x + 1| = -40

What is the negative solution to the given equation?`,
    "-9",
  ),
  spr(
    "fac-2b",
    "absolute value equations",
    "medium",
    `2|x - 5| - 7|x - 5| = -45

What is the negative solution to the given equation?`,
    "-4",
  ),
  spr(
    "fac-3a",
    "factoring",
    "medium",
    `15x^3 - 25x^2

Factor the given expression completely.`,
    factorOrderAnswers("5x^2", "3x-5"),
  ),
  spr(
    "fac-3b",
    "factoring",
    "medium",
    `14x^2y + 21xy^2

Factor the given expression completely.`,
    factorOrderAnswers("7xy", "2x+3y"),
  ),
  spr(
    "fac-4a",
    "factoring quadratics",
    "medium",
    `x^2 + 3x - 18

Factor the given expression.`,
    factorOrderAnswers("(x+6)", "(x-3)"),
  ),
  spr(
    "fac-4b",
    "factoring quadratics",
    "medium",
    `x^2 + 2x - 24

Factor the given expression.`,
    factorOrderAnswers("(x+6)", "(x-4)"),
  ),
  spr(
    "fac-5a",
    "factoring difference of squares",
    "medium",
    `9x^2 - 25

Factor the given expression completely.`,
    factorOrderAnswers("(3x+5)", "(3x-5)"),
  ),
  spr(
    "fac-5b",
    "factoring difference of squares",
    "medium",
    `16x^2 - 49

Factor the given expression.`,
    factorOrderAnswers("(4x+7)", "(4x-7)"),
  ),
  spr(
    "fac-6a",
    "quadratic equations",
    "medium",
    `x^2 - 4x - 45 = 0

What is the positive solution to the given equation?`,
    "9",
  ),
  spr(
    "fac-6b",
    "quadratic equations",
    "medium",
    `x^2 - 6x - 16 = 0

What is the positive solution to the given equation?`,
    "8",
  ),
  mc(
    "fac-7a",
    "factoring quadratics",
    "hard",
    `3x^2 + 10x + 8

Which of the following is a factor of the given expression?`,
    ["x + 4", "3x + 2", "3x + 4", "x - 2"],
    "c",
  ),
  mc(
    "fac-7b",
    "factoring quadratics",
    "hard",
    `5x^2 - 13x - 6

Which of the following is a factor of the given expression?`,
    ["x + 3", "5x - 2", "x - 2", "5x + 2"],
    "d",
  ),
  mc(
    "fac-8a",
    "factoring by grouping",
    "hard",
    `x^3 + 5x^2 + 2x + 10

Which of the following is equivalent to the given expression?`,
    ["(x^2 + 2)(x + 5)", "(x^2 + 5)(x + 2)", "(x^2 + 10)(x + 1)", "x(x + 5) + 2"],
    "a",
  ),
  mc(
    "fac-8b",
    "factoring by grouping",
    "hard",
    `x^3 - 2x^2 + 7x - 14

Which of the following is equivalent to the given expression?`,
    ["(x^2 - 7)(x + 2)", "(x^2 - 2)(x + 7)", "(x^2 + 7)(x - 2)", "(x^2 + 14)(x - 1)"],
    "c",
  ),
  mc(
    "fac-9a",
    "equivalent expressions",
    "hard",
    `(x^2 - 16) / (x^2 + 7x + 12)

For all positive values of x, which of the following is equivalent to the given expression?`,
    ["-16 / (7x + 12)", "(x + 4) / (x + 3)", "(x - 4) / (x + 3)", "(x - 4) / (x + 4)"],
    "c",
  ),
  mc(
    "fac-9b",
    "equivalent expressions",
    "hard",
    `(x^2 - 25) / (x^2 + 7x + 10)

For all positive values of x, which of the following is equivalent to the given expression?`,
    ["(x + 5) / (x + 2)", "-25 / (7x + 10)", "(x - 5) / (x + 5)", "(x - 5) / (x + 2)"],
    "d",
  ),
  spr(
    "fac-10a",
    "factoring quadratics",
    "medium",
    `x^2 + kx + 28 = (x + 4)(x + m)

In the given equation, k and m are constants. What is the value of k?`,
    "11",
  ),
  spr(
    "fac-10b",
    "factoring quadratics",
    "medium",
    `x^2 + kx - 30 = (x - 5)(x + m)

In the given equation, k and m are constants. What is the value of k?`,
    "1",
  ),
  spr(
    "fac-11a",
    "difference of squares",
    "medium",
    "If x^2 - y^2 = 56 and x - y = 4, what is the value of x + y?",
    "14",
  ),
  spr(
    "fac-11b",
    "difference of squares",
    "medium",
    "If m^2 - n^2 = 45 and m + n = 15, what is the value of m - n?",
    "3",
  ),
  spr(
    "fac-12a",
    "quadratic equations",
    "hard",
    `x^4 - 20x^2 + 64 = 0

What is the sum of all positive solutions to the given equation?`,
    "6",
  ),
  spr(
    "fac-12b",
    "quadratic equations",
    "hard",
    `x^4 - 29x^2 + 100 = 0

What is the sum of all positive solutions to the given equation?`,
    "7",
  ),
  spr(
    "fac-13a",
    "factoring quadratics",
    "hard",
    `10x^2 + bx - 21 = (5x - 3)(2x + c)

In the given equation, b and c are constants. What is the value of b?`,
    "29",
  ),
  spr(
    "fac-13b",
    "factoring quadratics",
    "hard",
    `12x^2 + bx + 10 = (4x + 5)(3x + c)

In the given equation, b and c are constants. What is the value of b?`,
    "23",
  ),
];

const EXCLUDED_SAT_KEYS = new Set([
  "sat-1",
  "sat-1a",
  "sat-1b",
  "sat-2",
  "sat-2a",
  "sat-2b",
  "sat-3",
  "sat-3a",
  "sat-3b",
  "sat-4",
  "sat-4a",
  "sat-4b",
  "sat-5",
  "sat-6",
]);

export function followUpSourceKey(tags: readonly string[] | null | undefined): string {
  return (tags ?? []).find((tag) => tag.startsWith("sat-") || tag.startsWith("fac-")) ?? "";
}

export function isXavierAuthoredFollowUpQuestion(question: {
  tags?: string[] | null;
  questionType?: string | null;
  prompt?: string | null;
  correctAnswer?: string | null;
  choices?: unknown;
}): boolean {
  if (!(question.tags ?? []).includes(XAVIER_AUTHORED_FOLLOW_UP_TAG)) return false;
  const prompt = question.prompt?.trim() ?? "";
  const answer = question.correctAnswer?.trim() ?? "";
  if (prompt.length < 40 || !answer) return false;
  const type = (question.questionType ?? "").trim().toLowerCase();
  if (type === "spr" || type === "student_produced_response" || type === "free_response") {
    return true;
  }
  if (!/^[a-d]$/i.test(answer)) return false;
  if (!Array.isArray(question.choices) || question.choices.length < 4) return false;
  return question.choices.every((choice) => {
    if (!choice || typeof choice !== "object") return false;
    const text = String((choice as { text?: unknown }).text ?? "").trim();
    return text.length > 0;
  });
}

export function satMathFollowUpKeys(): string[] {
  return SAT_MATH_FOLLOW_UP_QUESTIONS.map((question) => question.sourceKey);
}

export function assertFollowUpSelection(): void {
  const keys = satMathFollowUpKeys();
  if (keys.length !== 22) throw new Error(`SAT Math follow-up has ${keys.length} questions.`);
  if (keys.some((key) => EXCLUDED_SAT_KEYS.has(key))) {
    throw new Error("SAT Math follow-up includes an excluded problem.");
  }
  if (FACTORING_QUIZ_QUESTIONS.length !== 26) {
    throw new Error(`Factoring quiz has ${FACTORING_QUIZ_QUESTIONS.length} questions.`);
  }
  if (FACTORING_QUIZ_QUESTIONS.some((question) => question.sourceKey.endsWith("-ex"))) {
    throw new Error("Factoring quiz includes an example.");
  }
}
