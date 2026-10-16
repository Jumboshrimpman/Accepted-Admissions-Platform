import type { BankChoice, ExtractGaps, ParsedBankRecord } from "./sat-bank-import.ts";
import { ORIGINAL_HARD_SAT_DATES } from "./sat-set-difficulty.ts";

/**
 * Individually authored hard digital SAT items for Nov 27, Dec 11, and Dec 18.
 * Multiple choice only. Nothing here runs at boot.
 */

const DATES = ORIGINAL_HARD_SAT_DATES;
const GAPS: ExtractGaps = {
  skillDifficultyAbsent: false,
  missingPrompt: false,
  missingChoices: false,
  figuresIncomplete: false,
  spr: false,
  figurePrimary: false,
  notes: [],
};
const LETTERS = ["a", "b", "c", "d"] as const;

export type OriginalHardMathItem = {
  dateKey: string;
  section: "math";
  questionNumber: number;
  sourceKey: string;
  prompt: string;
  stimulus: null;
  choices: BankChoice[];
  correctAnswer: string;
  explanation: string;
  difficultyNote: string;
  domain: string;
  skill: string;
  solve: () => number;
};

export type OriginalHardRwItem = {
  dateKey: string;
  section: "rw";
  questionNumber: number;
  sourceKey: string;
  prompt: string;
  stimulus: string;
  choices: BankChoice[];
  correctAnswer: string;
  explanation: string;
  difficultyNote: string;
  domain: string;
  skill: string;
};

function sourceKey(dateKey: string, section: "rw" | "math", questionNumber: number): string {
  return `original-hard-${dateKey}-${section}-${String(questionNumber).padStart(2, "0")}`;
}

function keySlot(index: number, dateIndex: number): number {
  return (index * 3 + dateIndex + 1) % 4;
}

function placeTexts(correct: string, distractors: readonly string[], slot: number): {
  choices: BankChoice[];
  correctAnswer: string;
} {
  if (distractors.length !== 3) throw new Error("Expected three distractors.");
  if (distractors.includes(correct) || new Set(distractors).size !== 3) {
    throw new Error(`Distractors collided with ${correct}.`);
  }
  const texts = ["", "", "", ""];
  texts[slot] = correct;
  let next = 0;
  for (let index = 0; index < 4; index += 1) {
    if (texts[index]) continue;
    texts[index] = distractors[next]!;
    next += 1;
  }
  return {
    choices: texts.map((text, index) => ({
      id: LETTERS[index]!,
      label: LETTERS[index]!.toUpperCase(),
      text,
    })),
    correctAnswer: LETTERS[slot]!,
  };
}

function isqrt(n: number): number {
  const root = Math.round(Math.sqrt(n));
  if (root * root !== n) throw new Error(`Not a square: ${n}`);
  return root;
}

type MathDraft = {
  prompt: string;
  solve: () => number;
  wrong: [number, number, number];
  because: string;
  note: string;
  domain: string;
  skill: string;
};

function buildMath(dateKey: string, dateIndex: number, drafts: readonly MathDraft[]): OriginalHardMathItem[] {
  if (drafts.length !== 35) throw new Error(`Expected 35 math items for ${dateKey}.`);
  return drafts.map((draft, index) => {
    const questionNumber = 35 - index;
    const solved = draft.solve();
    if (!Number.isInteger(solved) || solved < 0) {
      throw new Error(`${dateKey} math ${questionNumber} solved to ${solved}.`);
    }
    if (draft.wrong.includes(solved) || new Set(draft.wrong).size !== 3) {
      throw new Error(`${dateKey} math ${questionNumber} distractors collided.`);
    }
    const placed = placeTexts(String(solved), draft.wrong.map(String), keySlot(index, dateIndex));
    const explanation = `${draft.because} The result is ${solved}.`;
    if (!explanation.includes(String(solved))) throw new Error("Explanation missed the result.");
    return {
      dateKey,
      section: "math",
      questionNumber,
      sourceKey: sourceKey(dateKey, "math", questionNumber),
      prompt: draft.prompt,
      stimulus: null,
      choices: placed.choices,
      correctAnswer: placed.correctAnswer,
      explanation,
      difficultyNote: draft.note,
      domain: draft.domain,
      skill: draft.skill,
      solve: draft.solve,
    };
  });
}

const ADV = "Advanced Math";
const ALG = "Algebra";
const PSD = "Problem-Solving and Data Analysis";
const GEO = "Geometry and Trigonometry";

const MATH_BY_DATE: readonly (readonly MathDraft[])[] = [
  [
    {
      prompt:
        "A grocer's two pricing rules describe the same totals for every purchase. One crate plus two sacks costs 6 dollars. k crates plus four sacks cost 12 dollars. Which positive value of k makes the second rule a duplicate of the first?",
      solve: () => 2,
      wrong: [4, 12, 6],
      because: "The second rule is twice the first, so the crate coefficient must also double.",
      note: "Infinite solutions require matching both the variable coefficients and the constant, so doubling only the sacks is a trap.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A ferry toll and a bridge toll never meet. One ferry plus two bridges costs 6 dollars. k ferries plus four bridges cost 10 dollars. Which positive value of k makes the tolls inconsistent?",
      solve: () => 2,
      wrong: [4, 10, 5],
      because: "The bridge coefficients match when k is 2, but 10 is not twice 6, so the system has no solution.",
      note: "No solution needs the same left side ratio and a constant that breaks that ratio.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "In a puzzle, the larger number is 4 more than the smaller number, and three times the smaller number plus the larger number is 32. What is the larger number?",
      solve: () => 11,
      wrong: [7, 4, 8],
      because: "If the smaller number is s, then s plus 4 is the larger and 3s plus s plus 4 equals 32, so s is 7.",
      note: "Students who answer the smaller number, the difference, or the sum of the two parts miss the asked quantity.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "A model rocket's height in meters is 48 plus 32t minus 16t squared, where t is seconds after launch. It leaves a height of 48 meters and later returns to that same height. After how many seconds does it return?",
      solve: () => 2,
      wrong: [0, 32, 16],
      because: "Set the height equal to 48, which gives 32t minus 16t squared equals 0, so t is 0 or 2.",
      note: "The launch instant is an extraneous return time, and the linear coefficient is not the time.",
      domain: ADV,
      skill: "Nonlinear functions",
    },
    {
      prompt:
        "A flare's height in meters is 80t minus t squared, where t is seconds after lighting. At how many seconds is the flare at its greatest height?",
      solve: () => 40,
      wrong: [80, 20, 160],
      because: "The vertex of at minus t squared is at t equals a over 2.",
      note: "The vertex time is half the linear coefficient, not the coefficient itself or the maximum height.",
      domain: ADV,
      skill: "Quadratic functions",
    },
    {
      prompt:
        "A colony has 300 bacteria and doubles every hour. How many bacteria are there after 4 hours?",
      solve: () => 300 * 2 * 2 * 2 * 2,
      wrong: [1200, 2400, 600],
      because: "Four doublings multiply by 16.",
      note: "Stopping after two or three doublings, or multiplying by the number of hours, undercounts exponential growth.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A sample of 160 milligrams has a half life of one hour. How many milligrams remain after 4 hours?",
      solve: () => 160 / 2 / 2 / 2 / 2,
      wrong: [40, 80, 20],
      because: "Four half lives leave one sixteenth of the sample.",
      note: "One or two halvings are the tempting early stops.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A circular path satisfies x squared plus y squared plus 6x minus 8y minus 24 equals 0. What is the radius?",
      solve: () => isqrt(3 * 3 + 4 * 4 + 24),
      wrong: [49, 14, 5],
      because: "Completing the square gives radius squared equal to 9 plus 16 plus 24.",
      note: "The radius squared and the diameter are the usual wrong answers after completing the square.",
      domain: GEO,
      skill: "Circle equations",
    },
    {
      prompt:
        "A circular garden satisfies x squared plus y squared minus 4x minus 10y plus 4 equals 0. What is the positive y coordinate of its center?",
      solve: () => 5,
      wrong: [10, 2, 25],
      because: "Half of 10, with the sign flipped by completing the square, is the y coordinate.",
      note: "Keeping the linear coefficient, or squaring it, skips the half and sign change.",
      domain: GEO,
      skill: "Circle equations",
    },
    {
      prompt:
        "The rule p outputs 11 when its input is 3. The rule q takes the input of p, moves that input 2 to the right, and then adds 5 to the output. What does q output when its input is 5?",
      solve: () => 11 + 5,
      wrong: [11, 13, 6],
      because: "An input of 5 lands on the known input 3, and the output then rises by 5.",
      note: "Horizontal and vertical shifts stack, so using only the original output or only one shift is wrong.",
      domain: ADV,
      skill: "Nonlinear function transformations",
    },
    {
      prompt:
        "A cartographer in Kyoto is rescaling a coastline sketch. The rule p outputs 9 when its input is 4. The rule q outputs whatever p outputs at twice q's input. What does q output when its input is 2?",
      solve: () => 9,
      wrong: [18, 8, 4],
      because: "Twice 2 is the known input 4, so the output stays 9.",
      note: "A horizontal compression does not multiply the output.",
      domain: ADV,
      skill: "Nonlinear function transformations",
    },
    {
      prompt:
        "A jacket priced at 250 dollars rises by 20 percent and then falls by 20 percent of the new price. What is the final price in dollars?",
      solve: () => (250 * 120 * 80) / 10000,
      wrong: [250, 200, 260],
      because: "A rise and a later fall of the same percent do not cancel, because the fall applies to the higher price.",
      note: "Treating the percents as if they cancel returns the original price.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "A tailor in Lisbon is clearing winter woolens. A coat priced at 200 dollars is discounted 25 percent, and the reduced price is then discounted another 10 percent. What is the final price in dollars?",
      solve: () => (200 * 75 * 90) / 10000,
      wrong: [130, 150, 140],
      because: "The second discount applies to 150, not to the original price.",
      note: "Adding the percents, or stopping after the first discount, misses the chain.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "Five quiz scores have a mean of 80. A sixth score of 92 is included. What is the new mean?",
      solve: () => (5 * 80 + 92) / 6,
      wrong: [86, 92, 80],
      because: "The new total is 400 plus 92, shared across six scores.",
      note: "Averaging the old mean with the new score, or keeping the old mean, ignores the counts.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "Every value in a data set with mean 40 increases by 5. What is the new mean?",
      solve: () => 40 + 5,
      wrong: [40, 35, 8],
      because: "Adding a constant to every value adds that constant to the mean.",
      note: "The spread does not change, which tempts students to leave the mean unchanged.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "Harbor voters in Cadiz were asked about a dredging levy. A poll reports 62 percent with a margin of error of 4 percentage points. What is the lowest percent still inside that poll's range?",
      solve: () => 62 - 4,
      wrong: [62, 66, 4],
      because: "The lower bound subtracts the margin from the reported percent.",
      note: "Adding the margin, or reporting the margin alone, misses the bound.",
      domain: PSD,
      skill: "Inference from sample statistics",
    },
    {
      prompt:
        "A survey has a margin of error of 6 percentage points. The sample size becomes four times as large, and nothing else about the method changes. What is the new margin of error in percentage points?",
      solve: () => 6 / 2,
      wrong: [6, 12, 24],
      because: "Multiplying the sample by four divides the margin by the square root of four.",
      note: "The margin is divided by two, not by four.",
      domain: PSD,
      skill: "Inference from sample statistics",
    },
    {
      prompt:
        "A pole 12 meters tall casts an 8 meter shadow. At the same moment, a post casts a 2 meter shadow. How many meters tall is the post?",
      solve: () => (12 * 2) / 8,
      wrong: [4, 6, 16],
      because: "The height ratio equals the shadow ratio, 12 over 8.",
      note: "Similar triangles ask for the corresponding side, not the difference of the given lengths.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "A smaller shape and a larger copy have matching sides. A side of 6 meters on the smaller shape matches a side of 15 meters on the larger copy. Another side of the smaller shape is 10 meters. What is the matching side of the larger copy, in meters?",
      solve: () => (10 * 15) / 6,
      wrong: [4, 19, 21],
      because: "The scale factor from the smaller triangle to the larger is 15 over 6.",
      note: "Using the scale factor upside down, or adding the difference, breaks the correspondence.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "A circular arc has radius 9 meters and central angle 2 radians. What is the arc length in meters?",
      solve: () => 9 * 2,
      wrong: [9, 36, 11],
      because: "Arc length is radius times the angle in radians.",
      note: "Squaring the radius is the sector trap, and the radius alone ignores the angle.",
      domain: GEO,
      skill: "Right triangles and trigonometry",
    },
    {
      prompt:
        "A sector has radius 4 meters and central angle 2 radians. What is the area of the sector in square meters?",
      solve: () => (4 * 4 * 2) / 2,
      wrong: [32, 8, 4],
      because: "Sector area is one half radius squared times the angle in radians.",
      note: "Forgetting the one half, or using arc length, produces the neighboring values.",
      domain: GEO,
      skill: "Right triangles and trigonometry",
    },
    {
      prompt:
        "The equation x squared minus 6x plus k equals 0 has exactly one solution. What is the positive value of k?",
      solve: () => (6 / 2) * (6 / 2),
      wrong: [6, 36, 3],
      because: "One solution means the discriminant is zero, so k equals the square of half of 6.",
      note: "Half the coefficient and the square of the whole coefficient are the sign and step errors.",
      domain: ADV,
      skill: "Quadratic equations",
    },
    {
      prompt:
        "The equations kx plus y equals 8 and 2x plus y equals 5 have no solution. What is k?",
      solve: () => 2,
      wrong: [8, 5, 4],
      because: "The coefficients of x must match, while the constants already differ.",
      note: "Only one k makes the lines parallel; the constants are not that k.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A machine worth 20000 dollars loses 20 percent of its current value each year. What is it worth in dollars after 2 years?",
      solve: () => (20000 * 80 * 80) / 10000,
      wrong: [12000, 16000, 8000],
      because: "Each year keeps 80 percent of that year's value, so two years keep 64 percent.",
      note: "Subtracting 20 percent of the original price twice ignores that the second loss is smaller.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "Each shuttle fare is 15 dollars plus a 3 dollar booking charge. What is the total cost in dollars of 6 fares?",
      solve: () => (15 + 3) * 6,
      wrong: [90, 18, 93],
      because: "The charge is part of each fare, so the 18 dollar fare is multiplied by 6.",
      note: "Omitting the charge, charging it once, or pricing a single fare are the step errors.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "Start with 6, multiply by 4, subtract 5, and then multiply by 3. What is the result?",
      solve: () => (6 * 4 - 5) * 3,
      wrong: [72, 67, 19],
      because: "The subtraction happens before the final multiplication.",
      note: "Distributing the last factor too early, or stopping before it, changes the order of operations.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "A course grade is 70 percent of an exam score of 80 and 30 percent of a project score of 90. What is the course grade?",
      solve: () => (70 * 80 + 30 * 90) / 100,
      wrong: [85, 80, 87],
      because: "The heavier weight belongs to the exam.",
      note: "Swapping the weights, or averaging the scores equally, is the parameter trap.",
      domain: PSD,
      skill: "Percentages",
    },
    {
      prompt:
        "The scores 6, 6, 6, and 18 are recorded. The 18 is replaced by another 6. What is the new mean?",
      solve: () => 6,
      wrong: [9, 12, 18],
      because: "Every remaining score is 6, so the mean is 6.",
      note: "The old mean and the discarded outlier are the tempting leftovers.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "A fund of 500 dollars grows by 10 percent one year and by 10 percent again the next year. What is the fund worth in dollars after both years?",
      solve: () => (500 * 110 * 110) / 10000,
      wrong: [600, 550, 610],
      because: "The second 10 percent applies to 550, not to 500.",
      note: "Adding the percents as if they were flat amounts misses compound growth.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "The equation x squared plus kx plus 16 equals 0 has exactly one solution, and k is positive. What is k?",
      solve: () => 8,
      wrong: [16, 4, 32],
      because: "Half of k, squared, equals 16, and the positive root gives k equals 8.",
      note: "The constant term and half of the correct k are the unfinished steps.",
      domain: ADV,
      skill: "Quadratic equations",
    },
    {
      prompt:
        "An account of 1000 dollars earns 10 percent interest compounded once a year. What is the balance in dollars after 2 years, with no deposits or withdrawals?",
      solve: () => (1000 * 110 * 110) / 10000,
      wrong: [1200, 1100, 200],
      because: "Two compound years multiply by 1.1 twice.",
      note: "Simple interest adds the same 100 dollars twice and misses the interest on the interest.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "One line is y equals 2x plus 1. Another line is y equals 2x plus 5. How many points lie on both lines?",
      solve: () => 0,
      wrong: [1, 2, 5],
      because: "The slopes match and the intercepts differ, so the lines never meet.",
      note: "Parallel distinct lines have no shared point; the slope and the intercept are not counts of solutions.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A culture of 7 cells triples every hour. How many cells are there after 3 hours?",
      solve: () => 7 * 3 * 3 * 3,
      wrong: [21, 63, 28],
      because: "Three triplings multiply by 27.",
      note: "One or two triplings, or adding 3 three times, stop the exponent early.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A short ramp rises 3 meters over a horizontal run of 4 meters. A similar ramp rises 9 meters. What is the horizontal run of the taller ramp, in meters?",
      solve: () => (9 * 4) / 3,
      wrong: [6, 10, 36],
      because: "The run scales by the same factor as the rise, 9 over 3.",
      note: "Adding the rises, or multiplying the rises, breaks the similar-triangle ratio.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "A circular fountain satisfies x squared plus y squared minus 2x plus 8y minus 8 equals 0. What is the radius?",
      solve: () => isqrt(1 * 1 + 4 * 4 + 8),
      wrong: [25, 10, 4],
      because: "Completing the square gives radius squared equal to 1 plus 16 plus 8.",
      note: "Reporting the radius squared or the diameter skips the last square root.",
      domain: GEO,
      skill: "Circle equations",
    },
  ],
  [
    {
      prompt:
        "Two lab dilutions match for every pair of volumes. Three beakers plus one flask hold 9 liters. Six beakers plus two flasks hold k liters. Which positive k makes the second dilution a copy of the first?",
      solve: () => 18,
      wrong: [9, 6, 27],
      because: "The second dilution doubles every volume in the first, including the total.",
      note: "Infinite solutions fail if only the beaker count is doubled and the total is left behind.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "Two paint mixes can never be poured to the same color. Two cans plus one tube make 7 liters. k cans plus three tubes make 15 liters. Which positive k makes the mixes inconsistent?",
      solve: () => 6,
      wrong: [3, 15, 2],
      because: "Three times the first mix would use 6 cans, but 15 liters is not three times 7.",
      note: "The tube coefficient suggests the scale, and the unmatched total is what creates no solution.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A shuttle ticket costs 9 dollars more than a bus ticket. Three bus tickets plus one shuttle ticket cost 45 dollars. What is the price of one shuttle ticket in dollars?",
      solve: () => 18,
      wrong: [9, 15, 12],
      because: "If the bus ticket is b, then b plus 9 is the shuttle and 3b plus b plus 9 equals 45.",
      note: "The difference, the bus price, and a partial sum are each a stopped step.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "A ball's height in meters is 20 plus 18t minus 6t squared, where t is seconds after the throw. It starts at 20 meters and later comes back to 20 meters. After how many seconds does it come back?",
      solve: () => 3,
      wrong: [6, 18, 1],
      because: "18t minus 6t squared equals 0 factors as t times 18 minus 6t.",
      note: "The nonzero root is the return, not the coefficient of t or of t squared.",
      domain: ADV,
      skill: "Nonlinear functions",
    },
    {
      prompt:
        "A fountain jet's height in meters is 60t minus t squared, where t is seconds after the pump starts. At how many seconds is the jet highest?",
      solve: () => 30,
      wrong: [60, 15, 90],
      because: "The greatest height of at minus t squared occurs at half of a.",
      note: "Using the linear coefficient as the time, or quartering it, misses the vertex formula.",
      domain: ADV,
      skill: "Quadratic functions",
    },
    {
      prompt:
        "A savings jar holds 125 coins and the count doubles every day. How many coins are in the jar after 3 days?",
      solve: () => 125 * 2 * 2 * 2,
      wrong: [375, 500, 250],
      because: "Three doublings multiply by 8.",
      note: "Multiplying by the number of days, or by one doubling too few, is the exponent error.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A medicine dose of 96 milligrams halves every hour. How many milligrams remain after 4 hours?",
      solve: () => 96 / 16,
      wrong: [24, 48, 12],
      because: "Four halvings divide by 16.",
      note: "Two halvings leave a quarter, which is the early stop.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A round plaza satisfies x squared plus y squared minus 10x plus 4y minus 7 equals 0. What is the radius?",
      solve: () => isqrt(5 * 5 + 2 * 2 + 7),
      wrong: [36, 12, 5],
      because: "Completing the square gives radius squared equal to 25 plus 4 plus 7.",
      note: "The squared radius and twice the radius are the unfinished answers.",
      domain: GEO,
      skill: "Circle equations",
    },
    {
      prompt:
        "A round stage satisfies x squared plus y squared plus 8x minus 14y plus 40 equals 0. What is the positive y coordinate of its center?",
      solve: () => 7,
      wrong: [14, 4, 25],
      because: "Half of 14 is the y coordinate after the sign from completing the square.",
      note: "The linear coefficient itself is twice the coordinate students are asked for.",
      domain: GEO,
      skill: "Circle equations",
    },
    {
      prompt:
        "The rule p outputs 8 when its input is 1. The rule q reads an input 4 units to the right of p and then adds 3 to the output. What does q output when its input is 5?",
      solve: () => 8 + 3,
      wrong: [8, 12, 5],
      because: "The right shift sends 5 back to the known input 1, and then 3 is added.",
      note: "Applying only the vertical shift to the new input, or only the horizontal shift, drops a step.",
      domain: ADV,
      skill: "Nonlinear function transformations",
    },
    {
      prompt:
        "A sound editor in Oslo is compressing a recorded interview. The rule p outputs 15 when its input is 9. The rule q outputs whatever p outputs at three times q's input. What does q output when its input is 3?",
      solve: () => 15,
      wrong: [45, 27, 3],
      because: "Three times 3 is the known input, so the output is unchanged.",
      note: "Scaling the input does not scale the output by the same factor.",
      domain: ADV,
      skill: "Nonlinear function transformations",
    },
    {
      prompt:
        "A bike listed at 80 dollars is marked up 50 percent and then marked down 20 percent from the marked up price. What is the final price in dollars?",
      solve: () => (80 * 150 * 80) / 10000,
      wrong: [80, 112, 100],
      because: "The markdown is 20 percent of 120, not 20 percent of 80.",
      note: "These percents do not undo each other, and stopping after the markup leaves the middle price.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "A photographer in Accra is replacing studio gear. A camera priced at 360 dollars is discounted 50 percent, and that sale price is discounted another 10 percent. What is the final price in dollars?",
      solve: () => (360 * 50 * 90) / 10000,
      wrong: [144, 180, 126],
      because: "Half of 360 is 180, and 10 percent off 180 is the next step.",
      note: "Taking both discounts off the original price, or stopping at half, misses the chain.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "Four lap times have a mean of 70 seconds. A fifth lap of 90 seconds is included. What is the new mean in seconds?",
      solve: () => (4 * 70 + 90) / 5,
      wrong: [80, 90, 70],
      because: "The new total is 280 plus 90, divided by five laps.",
      note: "The average of 70 and 90 ignores how many laps were already counted.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "Every measurement in a set with mean 63 decreases by 3. What is the new mean?",
      solve: () => 63 - 3,
      wrong: [63, 66, 3],
      because: "Subtracting a constant from every measurement subtracts it from the mean.",
      note: "An unchanged mean is the trap for students thinking only about the spread.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "Clinic patients in Tunis were asked about evening appointments. A study reports 47 percent with a margin of error of 3 percentage points. What is the smallest percent that study still allows?",
      solve: () => 47 - 3,
      wrong: [47, 50, 3],
      because: "Subtract the margin from the reported percent.",
      note: "The upper bound and the unchanged estimate are the sign errors.",
      domain: PSD,
      skill: "Inference from sample statistics",
    },
    {
      prompt:
        "An estimate has a margin of error of 8 percentage points. The sample becomes four times as large, with the same method. What is the new margin of error in percentage points?",
      solve: () => 4,
      wrong: [8, 2, 16],
      because: "Four times the sample multiplies the margin by one half.",
      note: "Quartering the margin treats the sample factor as if it were not under a square root.",
      domain: PSD,
      skill: "Inference from sample statistics",
    },
    {
      prompt:
        "A tree 15 meters tall casts a 10 meter shadow. A nearby sapling casts a 4 meter shadow at the same time. How many meters tall is the sapling?",
      solve: () => (15 * 4) / 10,
      wrong: [8, 10, 4],
      because: "Height over shadow is 15 over 10, applied to the sapling shadow.",
      note: "The shadow lengths alone, or their difference, are not the sapling height.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "Two posters are similar. A 4 centimeter side corresponds to a 10 centimeter side. A second side of the smaller poster is 6 centimeters. What is the corresponding side of the larger poster, in centimeters?",
      solve: () => (6 * 10) / 4,
      wrong: [12, 8, 24],
      because: "The larger poster is 10 over 4 times the smaller one.",
      note: "Doubling the 6, or scaling by the difference of the given sides, drops the ratio.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "A circular track arc has radius 7 meters and central angle 3 radians. What is the arc length in meters?",
      solve: () => 7 * 3,
      wrong: [7, 42, 10],
      because: "In radians, arc length is radius times angle.",
      note: "Using the sector area formula here squares the radius by mistake.",
      domain: GEO,
      skill: "Right triangles and trigonometry",
    },
    {
      prompt:
        "A wedge has radius 6 meters and central angle 1 radian. What is the area of the wedge in square meters?",
      solve: () => (6 * 6 * 1) / 2,
      wrong: [36, 6, 9],
      because: "Area is one half radius squared times the radian measure.",
      note: "Radius squared without the one half is the doubled area.",
      domain: GEO,
      skill: "Right triangles and trigonometry",
    },
    {
      prompt:
        "The equation x squared plus 10x plus k equals 0 has exactly one solution. What is k?",
      solve: () => 25,
      wrong: [10, 100, 5],
      because: "Half of 10, squared, is the constant that makes the discriminant zero.",
      note: "The linear coefficient and its square skip the required half.",
      domain: ADV,
      skill: "Quadratic equations",
    },
    {
      prompt:
        "The equations kx plus y equals 9 and 5x plus y equals 1 have no point in common. What is k?",
      solve: () => 5,
      wrong: [9, 1, 10],
      because: "Parallel distinct lines need equal x coefficients, and the constants already differ.",
      note: "The constants 9 and 1 do not make the slopes equal.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A tablet worth 5000 dollars keeps 90 percent of its value each year. What is it worth in dollars after 2 years?",
      solve: () => (5000 * 90 * 90) / 10000,
      wrong: [4000, 4500, 450],
      because: "Two years at 90 percent give 81 percent of the original price.",
      note: "Subtracting 10 percent of the original price twice is straight line decay, not this model.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "Each museum ticket is 12 dollars plus a 4 dollar audio fee. What is the total cost in dollars of 9 tickets?",
      solve: () => (12 + 4) * 9,
      wrong: [108, 36, 16],
      because: "Each ticket costs 16 dollars, and there are 9 of them.",
      note: "Dropping the fee, charging only the fees, or pricing one ticket are the misses.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "Start with 5, multiply by 3, add 4, and then multiply by 2. What is the result?",
      solve: () => (5 * 3 + 4) * 2,
      wrong: [30, 34, 19],
      because: "Add 4 before the last multiplication, then double 19.",
      note: "Moving the addition outside the final factor is the distributive error.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "A final mark is 60 percent of a paper score of 90 and 40 percent of a lab score of 70. What is the final mark?",
      solve: () => (60 * 90 + 40 * 70) / 100,
      wrong: [80, 90, 78],
      because: "Sixty percent of 90 plus forty percent of 70 is the weighted mark.",
      note: "An equal average, or swapping which score gets 60 percent, changes the parameter.",
      domain: PSD,
      skill: "Percentages",
    },
    {
      prompt:
        "The values 5, 5, 5, 5, and 20 are listed. The 20 is replaced by another 5. What is the new mean?",
      solve: () => 5,
      wrong: [8, 10, 20],
      because: "All five values are then 5.",
      note: "The mean before the replacement still includes the outlier.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "A herd of 200 animals grows by 20 percent and then by another 10 percent of the new size. How many animals are there after both changes?",
      solve: () => (200 * 120 * 110) / 10000,
      wrong: [260, 240, 220],
      because: "Twenty percent of 200 is 40, and 10 percent of 240 is 24 more.",
      note: "Adding 20 and 10 as percents of the original herd skips the second base.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "The equation x squared plus kx plus 36 equals 0 has exactly one solution, and k is positive. What is k?",
      solve: () => 12,
      wrong: [36, 6, 18],
      because: "The positive k whose half squares to 36 is 12.",
      note: "Using the constant as k, or taking the square root and stopping, leaves the equation with two roots or none of the asked form.",
      domain: ADV,
      skill: "Quadratic equations",
    },
    {
      prompt:
        "A deposit of 400 dollars earns 5 percent interest compounded yearly. What is the balance in dollars after 2 years, with nothing added or removed?",
      solve: () => (400 * 105 * 105) / 10000,
      wrong: [440, 420, 40],
      because: "The second year earns 5 percent of 420, not another 20 dollars only.",
      note: "Simple interest and one year of interest are the stopped models.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "One line is y equals 4x minus 3. Another line is y equals 4x plus 6. How many points lie on both lines?",
      solve: () => 0,
      wrong: [1, 4, 6],
      because: "Equal slopes and different intercepts mean the lines do not meet.",
      note: "A single intersection is the answer for lines that are not parallel.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A pixel cluster starts at 4 pixels and triples every minute. How many pixels are there after 4 minutes?",
      solve: () => 4 * 3 * 3 * 3 * 3,
      wrong: [12, 36, 16],
      because: "Four triplings multiply by 81.",
      note: "Two triplings are the common early stop.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A loading ramp rises 2 meters over a horizontal run of 5 meters. A similar ramp rises 8 meters. What is the horizontal run of the taller ramp, in meters?",
      solve: () => (8 * 5) / 2,
      wrong: [10, 16, 40],
      because: "The rise quadruples, so the run quadruples from 5.",
      note: "Doubling the run, or multiplying the two rises, is not the similar ratio.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "A circular pool satisfies x squared plus y squared plus 12x minus 4y minus 9 equals 0. What is the radius?",
      solve: () => isqrt(6 * 6 + 2 * 2 + 9),
      wrong: [49, 6, 14],
      because: "Completing the square gives radius squared equal to 36 plus 4 plus 9.",
      note: "Half a linear coefficient is a center coordinate, not the radius.",
      domain: GEO,
      skill: "Circle equations",
    },
  ],
  [
    {
      prompt:
        "Two billing formulas at a print shop agree on every job. Five posters plus two banners cost 10 dollars. Fifteen posters plus six banners cost k dollars. Which positive k makes the formulas identical?",
      solve: () => 30,
      wrong: [10, 15, 60],
      because: "The second formula triples the first, so the price triples too.",
      note: "Matching only one coefficient leaves a system that is not the same line.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "Two shipping quotes never agree. Four crates plus one pallet cost 5 dollars. k crates plus three pallets cost 9 dollars. Which positive k makes the quotes inconsistent?",
      solve: () => 12,
      wrong: [3, 9, 4],
      because: "The pallet side triples, so k must be 12, and 9 is not three times 5.",
      note: "Using the constant or the original crate coefficient misses the scale that creates no solution.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A framed print costs 15 dollars more than the same print unframed. Two unframed prints plus one framed print cost 75 dollars. What is the price of one framed print in dollars?",
      solve: () => 35,
      wrong: [15, 25, 20],
      because: "If the unframed print is u, then u plus 15 is framed and 2u plus u plus 15 equals 75.",
      note: "The surcharge, the unframed price, and a two item subtotal are the partial answers.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "A drone's height in meters is 12 plus 20t minus 5t squared, where t is seconds after takeoff. It begins at 12 meters and later returns to 12 meters. After how many seconds does it return?",
      solve: () => 4,
      wrong: [5, 20, 2],
      because: "20t minus 5t squared equals 0 gives t equals 0 or t equals 4.",
      note: "The coefficient of t squared is not the return time.",
      domain: ADV,
      skill: "Nonlinear functions",
    },
    {
      prompt:
        "A water arc's height in meters is 48t minus t squared, where t is seconds after the valve opens. At how many seconds is the arc highest?",
      solve: () => 24,
      wrong: [48, 12, 16],
      because: "The vertex time is half of 48.",
      note: "Quartering the linear coefficient is a common vertex slip.",
      domain: ADV,
      skill: "Quadratic functions",
    },
    {
      prompt:
        "A newsletter has 40 subscribers and the list doubles every week. How many subscribers are there after 5 weeks?",
      solve: () => 40 * 2 * 2 * 2 * 2 * 2,
      wrong: [200, 640, 80],
      because: "Five doublings multiply by 32.",
      note: "Four doublings, or multiplying by the week count, cut the exponent short.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A tracer of 240 units halves every hour. How many units remain after 4 hours?",
      solve: () => 240 / 16,
      wrong: [60, 120, 30],
      because: "Four half lives leave one sixteenth.",
      note: "One half life and two half lives are the early answers.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A round window satisfies x squared plus y squared plus 2x minus 12y minus 12 equals 0. What is the radius?",
      solve: () => isqrt(1 * 1 + 6 * 6 + 12),
      wrong: [49, 6, 1],
      because: "Completing the square gives radius squared equal to 1 plus 36 plus 12.",
      note: "A center coordinate from half the linear term is not the radius.",
      domain: GEO,
      skill: "Circle equations",
    },
    {
      prompt:
        "A round courtyard satisfies x squared plus y squared minus 16x minus 6y plus 24 equals 0. What is the positive y coordinate of its center?",
      solve: () => 3,
      wrong: [6, 8, 9],
      because: "Half of 6 is the y coordinate of the center.",
      note: "The x side's half, 8, belongs to the other coordinate.",
      domain: GEO,
      skill: "Circle equations",
    },
    {
      prompt:
        "The rule p outputs 20 when its input is 6. The rule q reads an input 1 unit to the left of p and then adds 4 to the output. What does q output when its input is 5?",
      solve: () => 20 + 4,
      wrong: [20, 16, 21],
      because: "A left shift of 1 sends input 5 to the known input 6, and the output rises by 4.",
      note: "A left shift is not a subtraction from the output.",
      domain: ADV,
      skill: "Nonlinear function transformations",
    },
    {
      prompt:
        "A weaver in Oaxaca is stretching a dyed textile pattern. The rule p outputs 7 when its input is 8. The rule q outputs whatever p outputs at half of q's input. What does q output when its input is 16?",
      solve: () => 7,
      wrong: [14, 16, 4],
      because: "Half of 16 is the known input 8, so the output remains 7.",
      note: "A horizontal stretch does not double the output.",
      domain: ADV,
      skill: "Nonlinear function transformations",
    },
    {
      prompt:
        "A fare of 400 dollars rises by 10 percent and then falls by 10 percent of the raised fare. What is the final fare in dollars?",
      solve: () => (400 * 110 * 90) / 10000,
      wrong: [400, 360, 420],
      because: "Ten percent of the raised fare is 44, so the final fare is 440 minus 44.",
      note: "Equal percent up and down do not restore the original fare.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "A lighting shop in Bergen is closing its showroom. A lamp priced at 80 dollars is discounted 10 percent, and the discounted price is then reduced another 25 percent. What is the final price in dollars?",
      solve: () => (80 * 90 * 75) / 10000,
      wrong: [52, 72, 60],
      because: "Ten percent off leaves 72, and 25 percent off 72 is the final price.",
      note: "The order matters because the second percent applies to the already reduced price.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "Six rehearsal times have a mean of 75 minutes. A seventh time of 89 minutes is included. What is the new mean in minutes?",
      solve: () => (6 * 75 + 89) / 7,
      wrong: [82, 89, 75],
      because: "The new total is 450 plus 89, divided by seven.",
      note: "Averaging 75 and 89 equally pretends there was only one old time.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "Every entry in a list with mean 28 increases by 12. What is the new mean?",
      solve: () => 28 + 12,
      wrong: [28, 16, 12],
      because: "The mean shifts by the same constant added to every entry.",
      note: "Leaving the mean fixed confuses a shift with a change in spread.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "Library patrons in Malmo were asked about Sunday hours. A report gives 71 percent with a margin of error of 6 percentage points. What is the bottom of the published range, as a percent?",
      solve: () => 71 - 6,
      wrong: [71, 77, 6],
      because: "The lower bound is the estimate minus the margin.",
      note: "Adding the margin produces the upper bound instead.",
      domain: PSD,
      skill: "Inference from sample statistics",
    },
    {
      prompt:
        "A poll's margin of error is 12 percentage points. The sample size is multiplied by four, and the method is otherwise the same. What is the new margin of error in percentage points?",
      solve: () => 6,
      wrong: [12, 3, 24],
      because: "The square root of four is two, so the margin is halved.",
      note: "Dividing by four confuses the sample multiplier with the margin multiplier.",
      domain: PSD,
      skill: "Inference from sample statistics",
    },
    {
      prompt:
        "A tower 18 meters tall casts a 12 meter shadow. A sign casts a 4 meter shadow at the same time. How many meters tall is the sign?",
      solve: () => (18 * 4) / 12,
      wrong: [8, 12, 3],
      because: "The tower is 1.5 times its shadow, and the sign uses that same factor.",
      note: "Subtracting the shadows does not give the sign height.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "Two sails are similar. A 9 meter edge corresponds to a 12 meter edge. Another edge of the smaller sail is 15 meters. What is the corresponding edge of the larger sail, in meters?",
      solve: () => (15 * 12) / 9,
      wrong: [18, 12, 36],
      because: "The scale factor is 12 over 9, applied to 15.",
      note: "Adding 3 meters, the difference of the known edges, ignores the scale.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "A circular slice has radius 5 meters and central angle 4 radians. What is the arc length in meters?",
      solve: () => 5 * 4,
      wrong: [5, 40, 9],
      because: "Arc length in radians is the product of radius and angle.",
      note: "Half radius squared times the angle is the area, not the length.",
      domain: GEO,
      skill: "Right triangles and trigonometry",
    },
    {
      prompt:
        "A sector of a circle has radius 2 meters and central angle 5 radians. What is the area in square meters?",
      solve: () => (2 * 2 * 5) / 2,
      wrong: [20, 7, 4],
      because: "One half of radius squared times 5 radians is the area.",
      note: "Dropping the one half doubles the area to the arc style product.",
      domain: GEO,
      skill: "Right triangles and trigonometry",
    },
    {
      prompt:
        "The equation x squared minus 14x plus k equals 0 has exactly one solution. What is k?",
      solve: () => 49,
      wrong: [14, 196, 7],
      because: "Half of 14 squared is 49, which makes the discriminant zero.",
      note: "Squaring 14 without halving it is the step error.",
      domain: ADV,
      skill: "Quadratic equations",
    },
    {
      prompt:
        "The equations kx plus y equals 4 and 7x plus y equals 11 have no solution. What is k?",
      solve: () => 7,
      wrong: [4, 11, 14],
      because: "The lines are parallel exactly when the x coefficients are equal.",
      note: "Doubling the matching coefficient is not required for parallel lines.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A scooter worth 800 dollars keeps 75 percent of its current value each year. What is it worth in dollars after 2 years?",
      solve: () => (800 * 75 * 75) / 10000,
      wrong: [400, 600, 200],
      because: "Two years keep three quarters, then three quarters of that result.",
      note: "Subtracting a flat quarter of the original price twice is not compound depreciation.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "Eight choir tickets cost 5 dollars each, and one printed program costs 7 dollars. What is the total cost in dollars?",
      solve: () => 8 * 5 + 7,
      wrong: [40, 56, 15],
      because: "The tickets cost 40 dollars and the program adds 7.",
      note: "Pricing the program eight times, or adding the counts, misreads which charge repeats.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "Start with 8, multiply by 2, subtract 6, and then multiply by 5. What is the result?",
      solve: () => (8 * 2 - 6) * 5,
      wrong: [80, 74, 10],
      because: "Subtract 6 from 16 before multiplying by 5.",
      note: "Multiplying by 5 before the subtraction applies the factor to the wrong term.",
      domain: ALG,
      skill: "Linear equations in one variable",
    },
    {
      prompt:
        "A portfolio score is 25 percent of a quiz score of 60 and 75 percent of a test score of 100. What is the portfolio score?",
      solve: () => (25 * 60 + 75 * 100) / 100,
      wrong: [80, 60, 70],
      because: "The test carries three times the weight of the quiz.",
      note: "An equal average swaps away the 75 percent weight.",
      domain: PSD,
      skill: "Percentages",
    },
    {
      prompt:
        "The readings 3, 3, 3, and 11 are stored. The 11 is replaced by another 3. What is the new mean?",
      solve: () => 3,
      wrong: [5, 7, 11],
      because: "The four readings are then identical, so the mean is 3.",
      note: "The mean of the original list still counts the replaced reading.",
      domain: PSD,
      skill: "Evaluating statistical measures",
    },
    {
      prompt:
        "Attendance of 150 grows by 40 percent and then by 10 percent of the new attendance. What is the attendance after both changes?",
      solve: () => (150 * 140 * 110) / 10000,
      wrong: [225, 210, 165],
      because: "Forty percent of 150 is 60, and 10 percent of 210 is 21 more.",
      note: "Applying both percents to the original attendance drops the new base.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "The equation x squared plus kx plus 81 equals 0 has exactly one solution, and k is positive. What is k?",
      solve: () => 18,
      wrong: [81, 9, 27],
      because: "Half of the positive k is 9, because 9 squared is 81.",
      note: "The constant 81 would be k only if the linear term were not halved.",
      domain: ADV,
      skill: "Quadratic equations",
    },
    {
      prompt:
        "A fund of 250 dollars earns 20 percent interest compounded yearly. What is the balance in dollars after 2 years, with no other transactions?",
      solve: () => (250 * 120 * 120) / 10000,
      wrong: [350, 300, 100],
      because: "The balance becomes 300 and then 20 percent of 300 is added.",
      note: "Adding 20 percent of the original fund twice is simple interest.",
      domain: PSD,
      skill: "Percent change",
    },
    {
      prompt:
        "One line is y equals negative x plus 2. Another line is y equals negative x plus 9. How many points lie on both lines?",
      solve: () => 0,
      wrong: [1, 2, 9],
      because: "The slopes are equal and the lines are distinct, so there is no shared point.",
      note: "The intercepts are not the number of intersections.",
      domain: ALG,
      skill: "Systems of two linear equations",
    },
    {
      prompt:
        "A stack of 5 sheets triples every pass through a copier. How many sheets are there after 2 passes?",
      solve: () => 5 * 3 * 3,
      wrong: [15, 10, 25],
      because: "Two triplings multiply by 9.",
      note: "One tripling, or adding the pass count, stops before the second factor.",
      domain: ADV,
      skill: "Exponential functions",
    },
    {
      prompt:
        "A footbridge rises 6 meters over a horizontal run of 8 meters. A similar bridge rises 15 meters. What is the horizontal run of the taller bridge, in meters?",
      solve: () => (15 * 8) / 6,
      wrong: [16, 12, 18],
      because: "The rise factor is 15 over 6, and the run scales by that factor.",
      note: "Adding the difference of the rises to the run is not similarity.",
      domain: GEO,
      skill: "Similarity and triangles",
    },
    {
      prompt:
        "A circular mirror satisfies x squared plus y squared minus 6x plus 8y minus 11 equals 0. What is the radius?",
      solve: () => isqrt(3 * 3 + 4 * 4 + 11),
      wrong: [36, 3, 12],
      because: "Completing the square gives radius squared equal to 9 plus 16 plus 11.",
      note: "The radius squared is one step short of the radius.",
      domain: GEO,
      skill: "Circle equations",
    },
  ],
];

type RwDraft = {
  stimulus: string;
  prompt: string;
  correct: string;
  wrong: [string, string, string];
  explanation: string;
  note: string;
  domain: string;
  skill: string;
};

const CRAFT = "Craft and Structure";
const INFO = "Information and Ideas";
const CONV = "Standard English Conventions";
const EXPR = "Expression of Ideas";

const WORDS = "Which choice completes the text with the most logical and precise word or phrase?";
const TRANS = "Which choice completes the text with the most logical transition?";
const GOAL = "Which choice most effectively uses the information in the notes to accomplish this goal?";
const CROSS = "Based on the texts, how would the author of Text 2 most likely respond?";
const INFER = "Which choice is most strongly supported by the text?";
const QUANT = "Which choice is best supported by the data in the text?";
const STANDARD = "Which choice completes the text so that it conforms to the conventions of Standard English?";
const VERBS: [string, string, string, string] = ["is", "was", "are", "were"];

function verbsExcept(correct: string): [string, string, string] {
  const rest = VERBS.filter((verb) => verb !== correct);
  if (rest.length !== 3) throw new Error(`Verb set missed ${correct}.`);
  return [rest[0]!, rest[1]!, rest[2]!];
}

function emphasize(target: string, gloss: string): string {
  return `${GOAL} The writer wants to emphasize the ${target} ${gloss}.`;
}

const RW_BY_DATE: readonly (readonly RwDraft[])[] = [
  [
    {
      stimulus:
        "On a monitored reef, calcification fell across five seasons. Living coral cover stayed near the level recorded at the start of the study.",
      prompt: INFER,
      correct: "Calcification fell even though living coral cover stayed near its earlier level.",
      wrong: [
        "Calcification fell only after living coral cover collapsed.",
        "Living coral cover stayed high while calcification rose.",
        "Neither calcification nor living coral cover changed during the study.",
      ],
      explanation: "The text pairs a drop in calcification with cover that stayed near its start.",
      note: "The inference is hard because a stable cover reading tempts the claim that calcification also held steady.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "Of the 250 surveyed nests, 75 held live chicks when the June count ended.",
      prompt: QUANT,
      correct: "30 percent of the surveyed nests held live chicks.",
      wrong: [
        "75 percent of the surveyed nests held live chicks.",
        "45 percent of the surveyed nests held live chicks.",
        "250 of the surveyed nests were empty.",
      ],
      explanation: "75 out of 250 is thirty hundredths of the nests.",
      note: "The count of chicks is easy to report as a percent instead of dividing by the number of nests.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "The referee admitted the call was close but still described the ruling as ___.",
      prompt: WORDS,
      correct: "qualified",
      wrong: ["certain", "absolute", "final"],
      explanation: "Admitting the call was close, while still offering a ruling, makes the ruling qualified rather than absolute.",
      note: "Words in context is hard here because the concession and the remaining judgment pull in opposite directions.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The notebook inside the drawer ___ drying right now.",
      prompt: STANDARD,
      correct: "is",
      wrong: verbsExcept("is"),
      explanation: "Notebook is singular, and right now calls for the present verb is.",
      note: "An intervening prepositional phrase hides the singular head, and the time cue fixes the tense.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "A studio dye returns to its first color after rinsing. The lab notes mention cost, drying time, and brightness only as side details.",
      prompt: emphasize("reversibility", "of the dye"),
      correct: "The notes should stress the reversibility of the dye after rinsing.",
      wrong: [
        "The notes should stress how bright the dye looks on cotton.",
        "The notes should stress the drying time of the dye.",
        "The notes should stress the price of the dye.",
      ],
      explanation: "The goal names reversibility, and only one choice takes up that idea.",
      note: "Rhetorical synthesis is hard because the notes offer several true details and only one matches the stated goal.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 says the capital's aqueducts appeared only after a long drought. Text 2 undercuts the claim that aqueducts were a later invention and points to an older channel.",
      prompt: CROSS,
      correct: "dispute the later dating of aqueducts",
      wrong: [
        "accept the later dating of aqueducts",
        "dispute the later dating of cisterns",
        "describe the drought without mentioning construction",
      ],
      explanation: "Text 2 challenges the late date that Text 1 gives the aqueducts.",
      note: "Cross text response is hard because a nearby object and a agreeing stance both look plausible.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "Divers recorded one clear result ___.",
      prompt: STANDARD,
      correct: ": the wreck lay intact.",
      wrong: [", the wreck lay intact.", "; the wreck lay intact.", "the wreck lay intact."],
      explanation: "A colon introduces the one clear result that the sentence has already announced.",
      note: "Boundary choice is hard because a comma or a semicolon can look grammatical if the announcing phrase is ignored.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus:
        "The edition used vellum supplied by the monastery. The printer did not set the type; a scribe copied every page by hand.",
      prompt: INFER,
      correct: "The vellum came from the monastery, and the printer did not set the type.",
      wrong: [
        "The vellum came from the printer, who also set the type.",
        "The monastery set the type on paper rather than vellum.",
        "The printer did set the type after the monastery refused the job.",
      ],
      explanation: "The text assigns the vellum to the monastery and says the printer did not set the type.",
      note: "The inference is hard because the printer's role is easy to swap with the monastery's.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The share of students taking the evening lab rose from 18 percent to 45 percent.",
      prompt: QUANT,
      correct: "The evening lab share rose by 27 percentage points.",
      wrong: [
        "The evening lab share rose by 27 percent.",
        "The evening lab share rose by 45 percentage points.",
        "The evening lab share rose by 18 percentage points.",
      ],
      explanation: "The difference of the two percents is 27 percentage points, not a 27 percent change.",
      note: "Percent and percentage points are the distinction this item is built to test.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "With no data from the buoy, the captain nonetheless called the warning ___.",
      prompt: WORDS,
      correct: "unfounded",
      wrong: ["careful", "measured", "confirmed"],
      explanation: "A warning offered with no data, and pushed anyway, is unfounded.",
      note: "The vocabulary is hard because nonetheless can be misread as praise for a careful warning.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The cartons beside the window ___ waiting yesterday.",
      prompt: STANDARD,
      correct: "were",
      wrong: verbsExcept("were"),
      explanation: "Cartons is plural, and yesterday calls for the past verb were.",
      note: "Both number and tense have to be chosen, so a singular present verb is a double miss.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "A vault holds an instrument that records ground shakes. The notes also mention dust, a brass latch, and a faded label.",
      prompt: emphasize("seismograph", "in the vault"),
      correct: "The sentence should feature the seismograph kept in the vault.",
      wrong: [
        "The sentence should feature the brass latch on the vault.",
        "The sentence should feature the dust inside the vault.",
        "The sentence should feature the faded label on the door.",
      ],
      explanation: "The goal is the seismograph, not the other objects in the notes.",
      note: "Each note is accurate, so the hard part is selecting the one the writer asked to emphasize.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 describes guilds in a single port. Text 2 extends the evidence about guilds by adding apprenticeship rolls from a second port.",
      prompt: CROSS,
      correct: "add support for the view that guilds trained apprentices in more than one port.",
      wrong: [
        "set aside the view that guilds trained apprentices.",
        "add support for the view that parishes trained apprentices.",
        "list market prices without mentioning training.",
      ],
      explanation: "Text 2 builds on Text 1 by widening the guild evidence.",
      note: "A response that names guilds but drops the supportive stance is the near miss.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "The archivist Mara Ellison ___ cataloged the letters.",
      prompt: STANDARD,
      correct: ", who opened the trunk in Naples,",
      wrong: ["who opened the trunk in Naples", ", who opened the trunk in Naples", "opened the trunk in Naples,"],
      explanation: "The name is already identified, so the extra clause is nonrestrictive and needs commas on both sides.",
      note: "A missing comma on one side is the boundary error this item targets.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus:
        "City turnout rose by nine points from the previous election. The rain did not fall on election day, despite the forecast.",
      prompt: INFER,
      correct: "Turnout rose, and the rain did not account for the change.",
      wrong: [
        "Turnout rose because the rain did fall all morning.",
        "Turnout fell, and the rain did not change the result.",
        "Turnout stayed flat in dry weather.",
      ],
      explanation: "The text says turnout rose and that the rain did not fall.",
      note: "A causal story about rain is tempting even though the text removes the rain.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus:
        "In the poll, 61 percent favored the levy, and the release cited a margin of error of 3 percentage points.",
      prompt: QUANT,
      correct: "Support could have been as low as 58 percent.",
      wrong: [
        "Support could have been as low as 61 percent.",
        "Support could have been as low as 64 percent.",
        "Support could have been as low as 3 percent.",
      ],
      explanation: "The lower end of the interval is 61 minus 3.",
      note: "Adding the margin, or reporting it as the support level, misreads the interval.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "A slight shift in the pigment transformed the glaze, so reviewers called the change ___.",
      prompt: WORDS,
      correct: "disproportionate",
      wrong: ["tiny", "expected", "modest"],
      explanation: "A slight shift that transformed the glaze had an effect out of scale with the cause.",
      note: "The cause is small and the effect is large, so a synonym of slight is the trap.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The violin under the bench ___ resting last night.",
      prompt: STANDARD,
      correct: "was",
      wrong: verbsExcept("was"),
      explanation: "Violin is singular, and last night calls for the past verb was.",
      note: "The phrase under the bench can be misread as the subject.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "A speech praises a rival and then cuts the praise to one short clause. The notes also mention the crowd, the hall, and the hour.",
      prompt: emphasize("understatement", "in the speech"),
      correct: "The writer should highlight the understatement in the speech.",
      wrong: [
        "The writer should highlight the size of the crowd.",
        "The writer should highlight the hour of the speech.",
        "The writer should highlight the hall where it was given.",
      ],
      explanation: "The goal is the understatement, which the notes describe as praise cut short.",
      note: "Scene details compete with the rhetorical feature the writer named.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 praises the treaty as a complete peace. Text 2 qualifies the praise of the treaty by noting a border that fighters still contest.",
      prompt: CROSS,
      correct: "only partly accept the praise given to the treaty.",
      wrong: [
        "fully accept the praise given to the treaty.",
        "only partly accept the praise given to the envoy.",
        "describe the banquet after the signing.",
      ],
      explanation: "Text 2 limits the praise rather than repeating it.",
      note: "Full agreement with Text 1 is the stance students reach if they miss the qualification.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "After the glaze cooled ___.",
      prompt: STANDARD,
      correct: ", the potter stamped the foot.",
      wrong: [" the potter stamped the foot.", "; the potter stamped the foot.", ": the potter stamped the foot."],
      explanation: "An introductory clause is followed by a comma before the main clause.",
      note: "A semicolon or a colon after a dependent opening treats that opening as a full sentence.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus:
        "Adding amylase sped the reaction in the beaker. At the end of the trial, the substrate was unchanged.",
      prompt: INFER,
      correct: "Amylase sped the reaction even though the substrate was unchanged.",
      wrong: [
        "The reaction slowed when the enzyme was withheld.",
        "A different enzyme replaced every reactant in the beaker.",
        "The beaker cooled and the reaction never started.",
      ],
      explanation: "The enzyme sped the reaction without a change in the substrate.",
      note: "A faster reaction usually suggests a consumed substrate, which this text does not support.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The morning cohort averaged 78 points, and the evening cohort averaged 91 points.",
      prompt: QUANT,
      correct: "The cohorts show a difference of 13 points.",
      wrong: [
        "The cohorts show a difference of 78 points.",
        "The cohorts show a difference of 91 points.",
        "The cohorts show a difference of 169 points.",
      ],
      explanation: "The gap between the averages is 91 minus 78.",
      note: "Either average, or their sum, can be mistaken for the difference.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "The landslide blocked the highway ___ the county rerouted the buses.",
      prompt: TRANS,
      correct: "Therefore",
      wrong: ["However", "For example", "Meanwhile"],
      explanation: "Rerouting the buses is a result of the blocked highway.",
      note: "A contrast word is tempting if the reroute is read as a failure rather than a consequence.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus: "The fossils near the quarry ___ drying today.",
      prompt: STANDARD,
      correct: "are",
      wrong: verbsExcept("are"),
      explanation: "Fossils is plural, and today calls for the present verb are.",
      note: "A singular verb agrees with quarry, which is not the subject.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "Officials took an orchard to build a road and paid the growers below the sale price they had refused. The notes also mention rainfall, harvest crews, and a market day.",
      prompt: emphasize("expropriation", "of the orchard"),
      correct: "The paragraph should center the expropriation of the orchard.",
      wrong: [
        "The paragraph should center the rainfall on the orchard.",
        "The paragraph should center the harvest crews.",
        "The paragraph should center the market day.",
      ],
      explanation: "Taking the orchard for a road is the expropriation the goal names.",
      note: "The agricultural details are concrete, so they compete with the legal act the writer wants.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus: "The gallery locked its doors at dusk ___.",
      prompt: STANDARD,
      correct: "; the labels were still unfinished.",
      wrong: [", the labels were still unfinished.", ": the labels were still unfinished.", "the labels were still unfinished."],
      explanation: "Two independent clauses need a semicolon, not a comma alone.",
      note: "A comma splice is the boundary error, and a colon would announce a result the first clause does not set up.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus: "The orchard flourished last spring ___ the harvest failed in August.",
      prompt: TRANS,
      correct: "However",
      wrong: ["Therefore", "For example", "Meanwhile"],
      explanation: "A failed harvest contrasts with a spring that flourished.",
      note: "A result word would fit only if the failure followed from the success, which it does not.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus:
        "The sonnet addresses the city in the speaker's own voice. Across the fourteen lines, the speaker does not forgive the city.",
      prompt: INFER,
      correct: "The speaker does not forgive the city.",
      wrong: [
        "The speaker forgives the city in the final couplet.",
        "The city answers the speaker in a second voice.",
        "The poem leaves the city unmentioned.",
      ],
      explanation: "The text says the speaker does not forgive the city.",
      note: "A closing forgiveness is a familiar sonnet turn that this text withholds.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The museum keeps several textiles ___ a tapestry from 1684 hangs in the foyer.",
      prompt: TRANS,
      correct: "For example",
      wrong: ["Therefore", "However", "Meanwhile"],
      explanation: "The tapestry is one instance of the textiles the museum keeps.",
      note: "An example marker is required, and a contrast or result word invents a relationship the clauses do not have.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus: "Club membership increased from 400 to 460.",
      prompt: QUANT,
      correct: "Membership shows an increase of 60.",
      wrong: [
        "Membership shows an increase of 400.",
        "Membership shows an increase of 460.",
        "Membership shows an increase of 860.",
      ],
      explanation: "The increase is the later count minus the earlier count.",
      note: "Adding the two counts treats them as separate groups.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "The manuals beyond the shelf ___ waiting last year.",
      prompt: STANDARD,
      correct: "were",
      wrong: verbsExcept("were"),
      explanation: "Manuals is plural, and last year calls for the past verb were.",
      note: "Shelf can be mistaken for the subject if the head noun is skipped.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "A marsh supports many plant and animal kinds, including nesting birds and salt grasses. The notes also mention a footpath, a gate, and a bench.",
      prompt: emphasize("biodiversity", "of the marsh"),
      correct: "The closing sentence should stress the biodiversity of the marsh.",
      wrong: [
        "The closing sentence should stress the footpath through the marsh.",
        "The closing sentence should stress the gate at the entrance.",
        "The closing sentence should stress the bench by the water.",
      ],
      explanation: "Plant and animal kinds are the biodiversity the goal asks for.",
      note: "Visitor fixtures are easier to picture than the ecological idea the writer named.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus: "Engineers reported one clear result ___.",
      prompt: STANDARD,
      correct: ": the span carried the test load.",
      wrong: [", the span carried the test load.", "; the span carried the test load.", "the span carried the test load."],
      explanation: "The colon presents the single result the opening clause announces.",
      note: "Without the announcing phrase, a comma would look sufficient.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus: "The flood damaged the bridge ___ officials postponed the race.",
      prompt: TRANS,
      correct: "Consequently",
      wrong: ["However", "For example", "Meanwhile"],
      explanation: "Postponing the race results from the damage to the bridge.",
      note: "Consequence and contrast are close when a plan is dropped, but the second clause follows from the first.",
      domain: EXPR,
      skill: "Transitions",
    },
  ],
  [
    {
      stimulus: "The isotope ratio in the clay shows that the shard is older than the kiln found beside it.",
      prompt: INFER,
      correct: "The isotope evidence marks the shard as older than the kiln.",
      wrong: [
        "The kiln was fired long before the shard was shaped.",
        "The shard and the kiln come from the same firing.",
        "The shard was shaped after the kiln was already standing.",
      ],
      explanation: "The ratio places the shard earlier than the kiln.",
      note: "Reversing which object is older is the easy misread of a comparison.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The share of riders on the late train rose from 12 percent to 39 percent.",
      prompt: QUANT,
      correct: "Late train ridership rose by 27 percentage points.",
      wrong: [
        "Late train ridership rose by 27 percent.",
        "Late train ridership rose by 39 percentage points.",
        "Late train ridership rose by 12 percentage points.",
      ],
      explanation: "Subtract the starting percent from the later percent.",
      note: "Calling the gap a percent change rather than percentage points is the targeted error.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "The editor conceded the footnote was thin yet still judged the article ___.",
      prompt: WORDS,
      correct: "equivocal",
      wrong: ["decisive", "complete", "settled"],
      explanation: "A thin footnote that the editor still stands behind leaves the judgment equivocal.",
      note: "Yet still keeps a judgment in play, so a word of full certainty goes too far.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The microscope beside the lamp ___ focusing right now.",
      prompt: STANDARD,
      correct: "is",
      wrong: verbsExcept("is"),
      explanation: "Microscope is singular, and right now calls for is.",
      note: "Lamp is closer to the verb, but it is not the subject.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "A workshop trains newcomers for seven years before they take their own commissions. The notes also mention wages, tools, and a lunch hour.",
      prompt: emphasize("apprenticeship", "at the workshop"),
      correct: "The writer should emphasize the apprenticeship at the workshop.",
      wrong: [
        "The writer should emphasize the wages paid at the workshop.",
        "The writer should emphasize the tools stored at the workshop.",
        "The writer should emphasize the lunch hour.",
      ],
      explanation: "Years of training before independent work are the apprenticeship.",
      note: "Pay and tools are concrete notes that do not satisfy the named goal.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 claims the new vaccines ended transmission within a month. Text 2 undercuts the claim that vaccines achieved that end and cites cases that continued.",
      prompt: CROSS,
      correct: "challenge the claim that vaccines ended transmission within a month.",
      wrong: [
        "accept the claim that vaccines ended transmission within a month.",
        "challenge the claim that quarantines ended transmission within a month.",
        "describe how clinics scheduled appointments.",
      ],
      explanation: "Text 2 disputes Text 1's claim about the vaccines.",
      note: "Agreeing with Text 1 ignores the cases Text 2 uses to push back.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "The census team published one clear result ___.",
      prompt: STANDARD,
      correct: ": the district had grown.",
      wrong: [", the district had grown.", "; the district had grown.", "the district had grown."],
      explanation: "The colon delivers the one result the sentence promised.",
      note: "A comma between the announcement and the result creates a run on.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus:
        "The fresco was finished in 1510. The patron did not choose the saints; the workshop selected them.",
      prompt: INFER,
      correct: "The fresco was finished in 1510, and the patron did not choose the saints.",
      wrong: [
        "The workshop left the wall unfinished in 1512.",
        "Every saint was selected by the person who paid for the wall.",
        "The wall remained a sketch and was never painted.",
      ],
      explanation: "The date and the patron's lack of choice are both in the text.",
      note: "Patronage usually implies choosing the subject, which is the assumption this text blocks.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus:
        "In the survey, 55 percent supported the bond, and the report gave a margin of error of 4 percentage points.",
      prompt: QUANT,
      correct: "Support could have been as low as 51 percent.",
      wrong: [
        "Support could have been as low as 55 percent.",
        "Support could have been as low as 59 percent.",
        "Support could have been as low as 4 percent.",
      ],
      explanation: "55 minus 4 is the bottom of the interval.",
      note: "The upper bound is the sign error on the margin.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "The critic had no measurements of attendance and even so labeled the slump ___.",
      prompt: WORDS,
      correct: "baseless",
      wrong: ["documented", "precise", "verified"],
      explanation: "A slump labeled without measurements is baseless.",
      note: "Even so can be misread as intensifying a documented claim.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The treaties under the glass ___ fading yesterday.",
      prompt: STANDARD,
      correct: "were",
      wrong: verbsExcept("were"),
      explanation: "Treaties is plural, and yesterday calls for were.",
      note: "Glass is singular and adjacent, so a singular verb is the agreement trap.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "Leaves in the plot build sugars when light reaches them. The notes also mention soil bags, a hose, and a wooden stake.",
      prompt: emphasize("photosynthesis", "in the plot"),
      correct: "The caption should emphasize photosynthesis in the plot.",
      wrong: [
        "The caption should emphasize the soil bags in the plot.",
        "The caption should emphasize the hose beside the plot.",
        "The caption should emphasize the wooden stake.",
      ],
      explanation: "Building sugars in light is photosynthesis.",
      note: "Equipment in the notes is easier to name than the process the goal identifies.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 maps one valley's speech. Text 2 extends the evidence about dialects by comparing vowel shifts in a neighboring valley.",
      prompt: CROSS,
      correct: "add support to the account of how dialects differ between the valleys.",
      wrong: [
        "set aside the account of how dialects differ between the valleys.",
        "add support to the account of how roads differ between the valleys.",
        "list festival dates from one valley.",
      ],
      explanation: "Text 2 adds comparative evidence about dialects.",
      note: "Naming dialects without the supportive stance misses how Text 2 relates to Text 1.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "The botanist Idris Hale ___ pressed the ferns.",
      prompt: STANDARD,
      correct: ", who hiked the ridge in Oregon,",
      wrong: ["who hiked the ridge in Oregon", ", who hiked the ridge in Oregon", "hiked the ridge in Oregon,"],
      explanation: "The hiker is already named, so the added clause takes a comma on each side.",
      note: "One sided punctuation is the error that makes the clause look restrictive or unfinished.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus:
        "The undercount was large in cities and much smaller in rural counties, according to the follow up study.",
      prompt: INFER,
      correct: "The undercount was larger in cities than in rural counties.",
      wrong: [
        "Towns and suburbs showed the same counting gap.",
        "The follow up study found no gap at all.",
        "Coastal counties were the only places with a counting gap.",
      ],
      explanation: "The text places the larger undercount in cities.",
      note: "Swapping cities and rural counties reverses the comparison the text actually makes.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The coastal plots averaged 42 kilograms, and the inland plots averaged 67 kilograms.",
      prompt: QUANT,
      correct: "The plots show a difference of 25 kilograms.",
      wrong: [
        "The plots show a difference of 42 kilograms.",
        "The plots show a difference of 67 kilograms.",
        "The plots show a difference of 109 kilograms.",
      ],
      explanation: "67 minus 42 is the gap between the averages.",
      note: "Reporting one of the averages as the gap skips the subtraction.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "A small delay in the overture upended the staging, and the notice called that delay ___.",
      prompt: WORDS,
      correct: "outsized",
      wrong: ["brief", "minor", "trivial"],
      explanation: "A small delay that upended the staging had an outsized effect.",
      note: "Synonyms of small describe the delay, not the effect the sentence is judging.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The ledger near the cabinet ___ resting last night.",
      prompt: STANDARD,
      correct: "was",
      wrong: verbsExcept("was"),
      explanation: "Ledger is singular, and last night calls for was.",
      note: "The time cue rules out a present verb even if the noun is read correctly.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "A court opinion turns on how earlier cases bind the present dispute. The notes also mention the courtroom clock, the benches, and the stenographer.",
      prompt: emphasize("jurisprudence", "behind the opinion"),
      correct: "The summary should emphasize the jurisprudence behind the opinion.",
      wrong: [
        "The summary should emphasize the courtroom clock.",
        "The summary should emphasize the benches.",
        "The summary should emphasize the stenographer.",
      ],
      explanation: "How earlier cases bind a dispute is the jurisprudence in the notes.",
      note: "The room's objects are vivid and irrelevant to the goal.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 praises the reform as a full success. Text 2 qualifies the praise of the reform by showing that one promised benefit never arrived.",
      prompt: CROSS,
      correct: "limit the claim that the reform was a full success.",
      wrong: [
        "repeat the claim that the reform was a full success.",
        "limit the claim that the harvest was a full success.",
        "describe the ribbon cutting in detail.",
      ],
      explanation: "Text 2 narrows Text 1's praise of the reform.",
      note: "Restating Text 1's praise misses the missing benefit that Text 2 stresses.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "Because the river rose ___.",
      prompt: STANDARD,
      correct: ", the crew moved the camp.",
      wrong: [" the crew moved the camp.", "; the crew moved the camp.", ": the crew moved the camp."],
      explanation: "Because introduces a dependent clause, which takes a comma before the main clause.",
      note: "A semicolon would require the opening to be an independent clause.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus:
        "Blocking the kinase slowed growth in the culture. The same treatment did not stop cell division.",
      prompt: INFER,
      correct: "Blocking the kinase did not stop cell division.",
      wrong: [
        "Blocking the kinase stopped cell division at once.",
        "The kinase treatment left growth unchanged.",
        "Cell division sped up when the kinase was blocked.",
      ],
      explanation: "Slower growth is not the same as stopped division, and the text separates them.",
      note: "A treatment that slows growth is easily overread as one that stops division.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "Weekly ridership increased from 80 to 140.",
      prompt: QUANT,
      correct: "Ridership shows an increase of 60.",
      wrong: [
        "Ridership shows an increase of 80.",
        "Ridership shows an increase of 140.",
        "Ridership shows an increase of 220.",
      ],
      explanation: "140 minus 80 is the increase.",
      note: "The new total and the old total are each a step short of the difference.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "Fog closed the runway ___ the airline rescheduled the flight.",
      prompt: TRANS,
      correct: "Therefore",
      wrong: ["However", "For example", "Meanwhile"],
      explanation: "Rescheduling follows from the closed runway.",
      note: "The second clause is a consequence, not a contrast or an example.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus: "The compasses inside the case ___ pointing today.",
      prompt: STANDARD,
      correct: "are",
      wrong: verbsExcept("are"),
      explanation: "Compasses is plural, and today calls for are.",
      note: "Case is singular, so agreeing with the nearer noun fails.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "Farmland around the port became streets and housing over two decades. The notes also mention ship horns, a lighthouse, and a market bell.",
      prompt: emphasize("urbanization", "around the port"),
      correct: "The essay should emphasize the urbanization around the port.",
      wrong: [
        "The essay should emphasize the ship horns around the port.",
        "The essay should emphasize the lighthouse.",
        "The essay should emphasize the market bell.",
      ],
      explanation: "Streets and housing replacing farmland are urbanization.",
      note: "Harbor sounds are memorable details that do not carry the goal.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus: "The press finished the signatures ___.",
      prompt: STANDARD,
      correct: "; the index was still missing.",
      wrong: [", the index was still missing.", ": the index was still missing.", "the index was still missing."],
      explanation: "The second clause can stand alone, so a semicolon joins it to the first.",
      note: "A comma alone would splice two sentences.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus: "The petition succeeded on Monday ___ the mayor rejected it on Friday.",
      prompt: TRANS,
      correct: "However",
      wrong: ["Therefore", "For example", "Meanwhile"],
      explanation: "Rejection on Friday contrasts with success on Monday.",
      note: "A result transition would claim the rejection followed as a consequence of the success.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus: "The elegy mourns a friend throughout, and it does not name that friend.",
      prompt: INFER,
      correct: "The elegy mourns a friend it does not name.",
      wrong: [
        "The elegy names the friend in the opening line.",
        "The elegy refuses to mourn and names a rival instead.",
        "The elegy celebrates a wedding and names every guest.",
      ],
      explanation: "Mourning and the absence of a name are both stated.",
      note: "Elegies often name the dead, so the text's refusal to name is easy to overwrite.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The college offers many fellowships ___ a grant from 1928 supports field study.",
      prompt: TRANS,
      correct: "For example",
      wrong: ["Therefore", "However", "Meanwhile"],
      explanation: "The 1928 grant is one of the fellowships just mentioned.",
      note: "The year can look like a result or a contrast if the example relation is missed.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus: "Of the 180 harvested crates, 45 spoiled before they reached the market.",
      prompt: QUANT,
      correct: "25 percent of the harvested crates spoiled.",
      wrong: [
        "45 percent of the harvested crates spoiled.",
        "180 percent of the harvested crates spoiled.",
        "55 percent of the harvested crates spoiled.",
      ],
      explanation: "45 out of 180 is one quarter of the crates.",
      note: "The raw count is the distractor that skips the division.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "The trophies beyond the case ___ shining last year.",
      prompt: STANDARD,
      correct: "were",
      wrong: verbsExcept("were"),
      explanation: "Trophies is plural, and last year calls for were.",
      note: "A present singular verb misses both the number and the time cue.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "A lab hides messages by scrambling letters that only a paired key can restore. The notes also mention coffee, a window, and a stapler.",
      prompt: emphasize("cryptography", "used by the lab"),
      correct: "The profile should emphasize the cryptography used by the lab.",
      wrong: [
        "The profile should emphasize the coffee in the lab.",
        "The profile should emphasize the window in the lab.",
        "The profile should emphasize the stapler.",
      ],
      explanation: "Scrambling letters with a key is cryptography.",
      note: "Office objects in the notes are decoys beside the named method.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus: "The translator Noor Patel ___ revised the preface.",
      prompt: STANDARD,
      correct: ", who found the gloss in Cairo,",
      wrong: ["who found the gloss in Cairo", ", who found the gloss in Cairo", "found the gloss in Cairo,"],
      explanation: "The translator is already named, so the clause is nonrestrictive.",
      note: "Dropping one comma is enough to make the punctuation wrong.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus: "Ice stranded the ferry ___ the captain postponed boarding.",
      prompt: TRANS,
      correct: "Consequently",
      wrong: ["However", "For example", "Meanwhile"],
      explanation: "Postponed boarding is the result of the ferry being stranded.",
      note: "A contrast word fits a change of plan only if the cause is ignored.",
      domain: EXPR,
      skill: "Transitions",
    },
  ],
  [
    {
      stimulus: "As the glacier retreated up the valley, the lake grew by several hectares.",
      prompt: INFER,
      correct: "The glacier retreated and the lake grew.",
      wrong: [
        "The glacier retreated and the lake shrank.",
        "The lake grew while the glacier advanced.",
        "The glacier and the lake both stayed in place.",
      ],
      explanation: "Retreat of the glacier and growth of the lake are both stated.",
      note: "Pairing retreat with a shrinking lake is a plausible but unsupported climate story.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The share of clinics offering late visits rose from 22 percent to 58 percent.",
      prompt: QUANT,
      correct: "Late visits became more common by 36 percentage points.",
      wrong: [
        "Late visits became more common by 36 percent.",
        "Late visits became more common by 58 percentage points.",
        "Late visits became more common by 22 percentage points.",
      ],
      explanation: "58 minus 22 is 36 percentage points.",
      note: "The endpoint percents are traps if the student does not subtract.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "The pilot admitted the crosswind was real but still called her confidence ___.",
      prompt: WORDS,
      correct: "tempered",
      wrong: ["absolute", "boundless", "unshaken"],
      explanation: "Admitting a real crosswind while keeping some confidence leaves that confidence tempered.",
      note: "But still preserves a limited confidence, not an absolute one.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The mural under the scaffold ___ drying right now.",
      prompt: STANDARD,
      correct: "is",
      wrong: verbsExcept("is"),
      explanation: "Mural is singular, and right now calls for is.",
      note: "Scaffold sits next to the blank, but the subject is mural.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "Loggers removed a wide stand of trees and left the slope bare. The notes also mention a canoe, a picnic, and a trail sign.",
      prompt: emphasize("deforestation", "on the slope"),
      correct: "The report should emphasize the deforestation on the slope.",
      wrong: [
        "The report should emphasize the canoe on the slope.",
        "The report should emphasize the picnic on the slope.",
        "The report should emphasize the trail sign.",
      ],
      explanation: "Removing the stand of trees is deforestation.",
      note: "Recreation details compete with the environmental change the goal names.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 says comets brought the planet's water in a single era. Text 2 undercuts the claim that comets were that source and points to minerals formed without them.",
      prompt: CROSS,
      correct: "reject the claim that comets supplied the planet's water.",
      wrong: [
        "accept the claim that comets supplied the planet's water.",
        "reject the claim that asteroids supplied the planet's metals.",
        "describe how observatories name new objects.",
      ],
      explanation: "Text 2 rejects Text 1's account of comets.",
      note: "Acceptance of Text 1 is available, but Text 2's minerals point the other way.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "The clinic announced one clear result ___.",
      prompt: STANDARD,
      correct: ": the trial met its target.",
      wrong: [", the trial met its target.", "; the trial met its target.", "the trial met its target."],
      explanation: "A colon is used after an announcement of one clear result.",
      note: "The result can look like a second independent clause if the announcement is ignored.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus:
        "The codex preserves the hymn in a careful hand. The scribe did not compose the hymn; an earlier singer did.",
      prompt: INFER,
      correct: "The codex preserves a hymn the scribe did not compose.",
      wrong: [
        "The codex preserves a hymn the scribe did compose.",
        "The scribe composed the hymn and left it out of the codex.",
        "The codex lost the hymn after the scribe revised it.",
      ],
      explanation: "Preservation and the scribe's lack of authorship are both in the text.",
      note: "Copying is easily confused with composing.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus:
        "In the sample, 64 percent recognized the logo, and the study reported a margin of error of 5 percentage points.",
      prompt: QUANT,
      correct: "Recognition could have been as low as 59 percent.",
      wrong: [
        "Recognition could have been as low as 64 percent.",
        "Recognition could have been as low as 69 percent.",
        "Recognition could have been as low as 5 percent.",
      ],
      explanation: "The lower bound is 64 minus the margin of 5.",
      note: "The margin itself is not the recognition rate.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "Without evidence from the dig, the guide still insisted the rumor was ___.",
      prompt: WORDS,
      correct: "speculative",
      wrong: ["proven", "established", "certain"],
      explanation: "A rumor insisted on without evidence is speculative.",
      note: "Still insisted can sound like certainty, which the lack of evidence undercuts.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The passports beside the desk ___ waiting yesterday.",
      prompt: STANDARD,
      correct: "were",
      wrong: verbsExcept("were"),
      explanation: "Passports is plural, and yesterday calls for were.",
      note: "Desk is a singular noun between the subject and the verb.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "Smiths heated ore until a workable metal separated from the rock. The notes also mention aprons, bellows noise, and a lunch pail.",
      prompt: emphasize("metallurgy", "at the forge"),
      correct: "The caption should emphasize the metallurgy at the forge.",
      wrong: [
        "The caption should emphasize the aprons at the forge.",
        "The caption should emphasize the bellows noise.",
        "The caption should emphasize the lunch pail.",
      ],
      explanation: "Heating ore to separate metal is metallurgy.",
      note: "Workshop clutter is specific and still off the goal.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 studies one village store. Text 2 extends the evidence about cooperatives by showing shared purchases in three more villages.",
      prompt: CROSS,
      correct: "build on the evidence that cooperatives organized shared purchases.",
      wrong: [
        "dismiss the evidence that cooperatives organized shared purchases.",
        "build on the evidence that festivals organized shared meals.",
        "describe the weather during the harvest.",
      ],
      explanation: "Text 2 extends Text 1's evidence about cooperatives.",
      note: "A dismissive stance uses the right noun and the wrong relationship.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "The conductor Leila Cho ___ rehearsed the choir.",
      prompt: STANDARD,
      correct: ", who tuned the organ in Seoul,",
      wrong: ["who tuned the organ in Seoul", ", who tuned the organ in Seoul", "tuned the organ in Seoul,"],
      explanation: "The conductor is named, so the added detail is a nonrestrictive clause with two commas.",
      note: "The clause is extra information, not a restriction on which conductor is meant.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus: "After the new tariff, imports fell through the winter, while exports stayed at their previous level.",
      prompt: INFER,
      correct: "Imports fell, while exports stayed at their previous level.",
      wrong: [
        "Imports fell, and exports fell with them.",
        "Exports stayed level only after imports rose.",
        "Neither imports nor exports changed after the tariff.",
      ],
      explanation: "The text separates a drop in imports from exports that stayed level.",
      note: "A tariff story often assumes both sides of trade move together.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The north class averaged 64 items, and the south class averaged 88 items.",
      prompt: QUANT,
      correct: "The classes show a difference of 24 items.",
      wrong: [
        "The classes show a difference of 64 items.",
        "The classes show a difference of 88 items.",
        "The classes show a difference of 152 items.",
      ],
      explanation: "88 minus 64 is the difference of the averages.",
      note: "The sum of the averages is the arithmetic slip.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "A tiny revision of the statute reshaped the penalty, and counsel called the revision ___.",
      prompt: WORDS,
      correct: "inordinate",
      wrong: ["slight", "minute", "narrow"],
      explanation: "A tiny revision that reshaped the penalty is being judged inordinate in effect.",
      note: "Words that repeat tiny describe the revision's size, not the judgment in the sentence.",
      domain: CRAFT,
      skill: "Words in Context",
    },
    {
      stimulus: "The helmet near the locker ___ resting last night.",
      prompt: STANDARD,
      correct: "was",
      wrong: verbsExcept("was"),
      explanation: "Helmet is singular, and last night calls for was.",
      note: "Locker is not the subject, though it is the nearer noun.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "Surveyors drew coasts and roads so travelers could follow them on paper. The notes also mention ink stains, a ruler, and a candle.",
      prompt: emphasize("cartography", "in the survey"),
      correct: "The chapter should emphasize the cartography in the survey.",
      wrong: [
        "The chapter should emphasize the ink stains in the survey.",
        "The chapter should emphasize the ruler.",
        "The chapter should emphasize the candle.",
      ],
      explanation: "Drawing coasts and roads for travel is cartography.",
      note: "Desk objects are accurate notes that miss the named craft.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus:
        "Text 1 praises the mural as a complete public success. Text 2 qualifies the praise of the mural by noting that one neighborhood never saw it.",
      prompt: CROSS,
      correct: "only partly accept the praise given to the mural.",
      wrong: [
        "fully accept the praise given to the mural.",
        "only partly accept the praise given to the statue.",
        "describe the scaffolding around the wall.",
      ],
      explanation: "Text 2 limits praise of the mural because part of the public never saw it.",
      note: "Full praise repeats Text 1 and drops Text 2's limit.",
      domain: CRAFT,
      skill: "Cross-Text Connections",
    },
    {
      stimulus: "Although the trail iced ___.",
      prompt: STANDARD,
      correct: ", the rangers kept it open.",
      wrong: [" the rangers kept it open.", "; the rangers kept it open.", ": the rangers kept it open."],
      explanation: "Although opens a dependent clause, so a comma follows it.",
      note: "The contrast is already in although, and the punctuation still has to join the clauses correctly.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus:
        "The engineered plasmid carried the marker into the cell. The chromosome was unchanged after the transfer.",
      prompt: INFER,
      correct: "The plasmid carried the marker, and the chromosome was unchanged.",
      wrong: [
        "The marker rewrote the cell's main genetic strand.",
        "No marker entered the cell during the transfer.",
        "The transfer altered the cell's main genetic strand.",
      ],
      explanation: "The marker moved with the plasmid while the chromosome stayed the same.",
      note: "A plasmid story often assumes the chromosome changed, which this text denies.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "Warehouse stock increased from 150 to 240.",
      prompt: QUANT,
      correct: "Stock shows an increase of 90.",
      wrong: ["Stock shows an increase of 150.", "Stock shows an increase of 240.", "Stock shows an increase of 390."],
      explanation: "240 minus 150 is the increase.",
      note: "The later stock level is not itself the increase.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "Smoke prevented entry ___ the staff evacuated the hall.",
      prompt: TRANS,
      correct: "Therefore",
      wrong: ["However", "For example", "Meanwhile"],
      explanation: "Evacuation is the result of being unable to enter.",
      note: "Meanwhile would only fit if the clauses were unrelated simultaneous events.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus: "The capsules inside the tray ___ cooling today.",
      prompt: STANDARD,
      correct: "are",
      wrong: verbsExcept("are"),
      explanation: "Capsules is plural, and today calls for are.",
      note: "Tray is singular and easy to treat as the subject.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "Several melodies sound at once and stay distinct in the choir piece. The notes also mention robes, chairs, and a music stand.",
      prompt: emphasize("polyphony", "in the choir piece"),
      correct: "The program note should emphasize the polyphony in the choir piece.",
      wrong: [
        "The program note should emphasize the robes.",
        "The program note should emphasize the chairs.",
        "The program note should emphasize the music stand.",
      ],
      explanation: "Distinct melodies sounding together are polyphony.",
      note: "Stage objects are visible and still not the musical feature requested.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus: "The library dimmed the lamps ___.",
      prompt: STANDARD,
      correct: "; the inventory continued upstairs.",
      wrong: [
        ", the inventory continued upstairs.",
        ": the inventory continued upstairs.",
        "the inventory continued upstairs.",
      ],
      explanation: "Each clause is independent, so a semicolon joins them.",
      note: "A comma splice is the error students accept when both clauses feel related.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus: "The startup expanded in March ___ sales declined in April.",
      prompt: TRANS,
      correct: "However",
      wrong: ["Therefore", "For example", "Meanwhile"],
      explanation: "A decline contrasts with the earlier expansion.",
      note: "Growth followed by a drop is contrast, not a result of the growth.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus:
        "The villanelle repeats its plea in the refrains. The final stanza does not resolve that plea.",
      prompt: INFER,
      correct: "The villanelle repeats a plea it does not resolve.",
      wrong: [
        "The villanelle repeats a plea and resolves it in the final stanza.",
        "The villanelle avoids repetition and resolves a different plea.",
        "The final stanza resolves a plea the poem never states.",
      ],
      explanation: "Repetition and an unresolved ending are both in the text.",
      note: "A resolved ending is the expected close that this poem refuses.",
      domain: INFO,
      skill: "Inferences",
    },
    {
      stimulus: "The archive owns various scores ___ a motet from 1577 is on display.",
      prompt: TRANS,
      correct: "For example",
      wrong: ["Therefore", "However", "Meanwhile"],
      explanation: "The motet is one of the various scores.",
      note: "The display can look like a result unless it is read as an instance.",
      domain: EXPR,
      skill: "Transitions",
    },
    {
      stimulus: "Of the 320 tagged shells, 80 were juveniles when the tide survey ended.",
      prompt: QUANT,
      correct: "25 percent of the tagged shells were juveniles.",
      wrong: [
        "80 percent of the tagged shells were juveniles.",
        "320 percent of the tagged shells were juveniles.",
        "40 percent of the tagged shells were juveniles.",
      ],
      explanation: "80 out of 320 is one quarter.",
      note: "The juvenile count is not already a percent.",
      domain: INFO,
      skill: "Command of Evidence",
    },
    {
      stimulus: "The lanterns beyond the gate ___ burning last year.",
      prompt: STANDARD,
      correct: "were",
      wrong: verbsExcept("were"),
      explanation: "Lanterns is plural, and last year calls for were.",
      note: "Gate is singular, and last year rules out the present.",
      domain: CONV,
      skill: "Form, Structure, and Sense",
    },
    {
      stimulus:
        "Certain fungi emit a steady glow along the forest floor at night. The notes also mention boots, a thermos, and a paper map.",
      prompt: emphasize("luminescence", "of the fungi"),
      correct: "The caption should emphasize the luminescence of the fungi.",
      wrong: [
        "The caption should emphasize the boots.",
        "The caption should emphasize the thermos.",
        "The caption should emphasize the paper map.",
      ],
      explanation: "A steady glow from the fungi is luminescence.",
      note: "Hiking gear in the notes does not answer a goal about the glow.",
      domain: EXPR,
      skill: "Rhetorical Synthesis",
    },
    {
      stimulus: "The jury entered the hall ___.",
      prompt: STANDARD,
      correct: "; the clerk read the charge.",
      wrong: [", the clerk read the charge.", ": the clerk read the charge.", "the clerk read the charge."],
      explanation: "The clerk's action is a separate independent clause.",
      note: "Related events in a courtroom still need a semicolon rather than a comma splice.",
      domain: CONV,
      skill: "Boundaries",
    },
    {
      stimulus: "The storm canceled the match ___ the league refunded the tickets.",
      prompt: TRANS,
      correct: "Consequently",
      wrong: ["However", "For example", "Meanwhile"],
      explanation: "The refund follows from the cancellation.",
      note: "A refund can look like a contrast with the cancellation if the cause is missed.",
      domain: EXPR,
      skill: "Transitions",
    },
  ],
];

function buildRw(dateKey: string, dateIndex: number, drafts: readonly RwDraft[]): OriginalHardRwItem[] {
  if (drafts.length !== 35) throw new Error(`Expected 35 reading items for ${dateKey}.`);
  return drafts.map((draft, index) => {
    const questionNumber = 35 - index;
    const blanks = draft.stimulus.split("___").length - 1;
    if (blanks > 1) throw new Error(`${dateKey} rw ${questionNumber} has ${blanks} blanks.`);
    const placed = placeTexts(draft.correct, draft.wrong, keySlot(index, dateIndex));
    return {
      dateKey,
      section: "rw",
      questionNumber,
      sourceKey: sourceKey(dateKey, "rw", questionNumber),
      prompt: draft.prompt,
      stimulus: draft.stimulus,
      choices: placed.choices,
      correctAnswer: placed.correctAnswer,
      explanation: draft.explanation,
      difficultyNote: draft.note,
      domain: draft.domain,
      skill: draft.skill,
    };
  });
}

export function originalHardMathItems(): OriginalHardMathItem[] {
  return MATH_BY_DATE.flatMap((drafts, dateIndex) => buildMath(DATES[dateIndex]!, dateIndex, drafts));
}

export function originalHardRwItems(): OriginalHardRwItem[] {
  return RW_BY_DATE.flatMap((drafts, dateIndex) => buildRw(DATES[dateIndex]!, dateIndex, drafts));
}

function toRecord(item: {
  sourceKey: string;
  section: "rw" | "math";
  questionNumber: number;
  prompt: string;
  stimulus: string | null;
  choices: BankChoice[];
  correctAnswer: string;
  explanation: string;
  difficultyNote: string;
  domain: string;
  skill: string;
}): ParsedBankRecord {
  return {
    sourceKey: item.sourceKey,
    dedupKey: item.sourceKey,
    examFamily: "sat",
    examVariant: "digital",
    practiceTestNumber: null,
    formCode: "original-hard",
    section: item.section,
    module: 2,
    questionNumber: item.questionNumber,
    position: item.questionNumber,
    collectionSlug: "original-hard-sat",
    collectionTitle: "Original hard SAT",
    prompt: item.prompt,
    stimulus: item.stimulus,
    choices: item.choices,
    correctAnswer: item.correctAnswer,
    officialExplanation: item.explanation,
    figures: [],
    scoring: {},
    skill: item.skill,
    domain: item.domain,
    difficulty: "H",
    questionType: "mcq",
    estimatedSeconds: 90,
    sourceKind: "original_hard",
    sourceFiles: { origin: "original-hard-sat", difficultyNote: item.difficultyNote },
    assets: [],
    extractGaps: GAPS,
    assignable: true,
  };
}

export function originalHardSatBankRecords(): ParsedBankRecord[] {
  return [...originalHardRwItems(), ...originalHardMathItems()].map((item) => toRecord(item));
}
