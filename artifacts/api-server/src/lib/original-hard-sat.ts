import type { BankChoice, ExtractGaps, ParsedBankRecord } from "./sat-bank-import.ts";
import { ORIGINAL_HARD_SAT_DATES } from "./sat-set-difficulty.ts";

/**
 * Original hard digital SAT items for the three sessions the official
 * module 2 pool cannot fill. Multiple choice only: the hard assign path
 * rejects student-produced responses. Nothing here runs at boot.
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
  domain: string;
  skill: string;
};

type BuiltStem = {
  prompt: string;
  solve: () => number;
  explanation: string;
};

function integerSolve(solve: () => number): () => number {
  return () => {
    const value = solve();
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Original hard math did not solve to a positive integer (${value}).`);
    }
    return value;
  };
}

function wrongNumbers(answer: number): number[] {
  const wrong: number[] = [];
  for (const candidate of [answer + 2, answer + 5, answer - 3, answer + 8, answer - 6, answer + 11, answer + 1, answer * 2]) {
    if (!Number.isInteger(candidate) || candidate <= 0 || candidate === answer || wrong.includes(candidate)) continue;
    wrong.push(candidate);
    if (wrong.length === 3) return wrong;
  }
  throw new Error(`Could not build three distractors for ${answer}.`);
}

function choicesFor(answer: number, slot: number): { choices: BankChoice[]; correctAnswer: string } {
  const texts = ["", "", "", ""];
  const at = slot % 4;
  texts[at] = String(answer);
  const wrong = wrongNumbers(answer);
  let next = 0;
  for (let index = 0; index < 4; index += 1) {
    if (texts[index]) continue;
    texts[index] = String(wrong[next]!);
    next += 1;
  }
  if (new Set(texts).size !== 4) throw new Error(`Math choices collided for ${answer}.`);
  return {
    choices: texts.map((text, index) => ({
      id: LETTERS[index]!,
      label: LETTERS[index]!.toUpperCase(),
      text,
    })),
    correctAnswer: LETTERS[at]!,
  };
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function units(n: number): string {
  return n === 1 ? "1 unit" : `${n} units`;
}

type MathFamily = {
  domain: string;
  skill: string;
  variants: number[][];
  build: (params: number[]) => BuiltStem;
};

const MATH_FAMILIES: readonly MathFamily[] = [
  {
    domain: "Algebra",
    skill: "Linear equations in one variable",
    variants: [
      [12, 9, 7],
      [15, 8, 6],
      [20, 11, 5],
      [18, 7, 9],
      [25, 6, 8],
      [14, 12, 4],
    ],
    build: ([fee, rate, hours]) => {
      const solve = integerSolve(() => fee! + rate! * hours!);
      return {
        prompt: `A workshop charges a ${fee} dollar registration fee and then ${rate} dollars for each hour of instruction. What is the total charge, in dollars, for ${hours} hours of instruction?`,
        solve,
        explanation: `Add the ${fee} dollar fee to ${hours} hours at ${rate} dollars each, which equals ${solve()}.`,
      };
    },
  },
  {
    domain: "Algebra",
    skill: "Systems of two linear equations",
    variants: [
      [18, 6],
      [30, 8],
      [42, 10],
      [24, 4],
      [36, 12],
      [50, 14],
    ],
    build: ([total, diff]) => {
      const solve = integerSolve(() => (total! + diff!) / 2);
      return {
        prompt: `A notebook and a pen together cost ${total} dollars. The notebook costs ${diff} dollars more than the pen. What is the cost, in dollars, of the notebook?`,
        solve,
        explanation: `The notebook costs half of ${total} plus ${diff}, which equals ${solve()} dollars.`,
      };
    },
  },
  {
    domain: "Problem-Solving and Data Analysis",
    skill: "Percentages",
    variants: [
      [80, 25, 8],
      [120, 20, 6],
      [200, 15, 10],
      [60, 10, 9],
      [150, 20, 12],
      [90, 30, 7],
    ],
    build: ([price, pct, fee]) => {
      const solve = integerSolve(() => (price! * (100 - pct!)) / 100 + fee!);
      return {
        prompt: `A coat priced at ${price} dollars is reduced by ${pct} percent. An alteration fee of ${fee} dollars is then added. What is the final price, in dollars?`,
        solve,
        explanation: `After the ${pct} percent reduction, adding the ${fee} dollar fee gives ${solve()}.`,
      };
    },
  },
  {
    domain: "Geometry and Trigonometry",
    skill: "Right triangles and trigonometry",
    variants: [
      [9, 12],
      [8, 15],
      [7, 24],
      [20, 21],
      [12, 35],
      [5, 12],
    ],
    build: ([along, up]) => {
      const solve = integerSolve(() => {
        const sum = along! * along! + up! * up!;
        const root = Math.round(Math.sqrt(sum));
        if (root * root !== sum) throw new Error("not a whole-number length");
        return root;
      });
      return {
        prompt: `A ladder has its base ${along} feet from a wall and its top ${up} feet above the ground. The wall meets the ground at a right angle. What is the length of the ladder, in feet?`,
        solve,
        explanation: `The two given lengths and the ladder form a whole-number triple, so the ladder is ${solve()} feet long.`,
      };
    },
  },
  {
    domain: "Problem-Solving and Data Analysis",
    skill: "One-variable data",
    variants: [
      [14, 18, 22, 16, 20],
      [11, 15, 19, 21, 18],
      [8, 12, 16, 20, 15],
      [9, 13, 17, 25, 20],
      [10, 14, 18, 22, 17],
      [6, 12, 18, 24, 16],
    ],
    build: ([a, b, c, d, mean]) => {
      const solve = integerSolve(() => mean! * 5 - (a! + b! + c! + d!));
      return {
        prompt: `The numbers ${a}, ${b}, ${c}, ${d}, and n have a mean of ${mean}. What is the value of n?`,
        solve,
        explanation: `Five numbers with mean ${mean} sum to ${mean! * 5}, so n equals ${solve()}.`,
      };
    },
  },
  {
    domain: "Problem-Solving and Data Analysis",
    skill: "Probability and counting",
    variants: [
      [6, 4],
      [8, 5],
      [9, 3],
      [7, 6],
      [10, 2],
      [11, 8],
    ],
    build: ([red, blue]) => {
      const solve = integerSolve(() => (red! * (red! - 1)) / 2);
      return {
        prompt: `A craft kit contains ${red} red tiles and ${blue} blue tiles. How many different pairs of red tiles can be chosen?`,
        solve,
        explanation: `The number of ways to choose 2 red tiles from ${red} is ${solve()}. The blue tiles are not part of the pair.`,
      };
    },
  },
  {
    domain: "Advanced Math",
    skill: "Equivalent expressions",
    variants: [
      [2, 5, 3],
      [3, 3, 2],
      [2, 6, 3],
      [5, 2, 2],
      [3, 4, 1],
      [2, 4, 5],
    ],
    build: ([base, left, right]) => {
      const solve = integerSolve(() => {
        let value = 1;
        for (let power = 0; power < left! + right!; power += 1) value *= base!;
        return value;
      });
      return {
        prompt: `What is the value of ${base} raised to the power of ${left}, multiplied by ${base} raised to the power of ${right}?`,
        solve,
        explanation: `Multiplying powers with the same base adds the exponents, so the value is ${solve()}.`,
      };
    },
  },
  {
    domain: "Geometry and Trigonometry",
    skill: "Area and volume",
    variants: [
      [20, 14, 2],
      [18, 12, 1],
      [24, 16, 3],
      [15, 11, 2],
      [22, 18, 4],
      [30, 20, 5],
    ],
    build: ([length, width, border]) => {
      const solve = integerSolve(() => (length! - 2 * border!) * (width! - 2 * border!));
      return {
        prompt: `A rectangular poster is ${length} inches long and ${width} inches wide. A border ${border} inches wide is cut away along every edge. What is the area, in square inches, of the remaining poster?`,
        solve,
        explanation: `Cutting ${border} inches from every edge shortens both dimensions, and the remaining area is ${solve()}.`,
      };
    },
  },
  {
    domain: "Algebra",
    skill: "Linear functions",
    variants: [
      [2, 5, 6, 17],
      [1, 4, 5, 16],
      [3, 2, 7, 18],
      [0, 1, 4, 13],
      [2, 8, 8, 26],
      [1, 3, 6, 23],
    ],
    build: ([x1, y1, x2, y2]) => {
      const solve = integerSolve(() => (y2! - y1!) / (x2! - x1!));
      return {
        prompt: `A line passes through a point ${units(x1!)} to the right of the origin and ${units(y1!)} up, and through a point ${units(x2!)} to the right of the origin and ${units(y2!)} up. What is the slope of the line?`,
        solve,
        explanation: `The vertical change divided by the horizontal change equals ${solve()}.`,
      };
    },
  },
  {
    domain: "Algebra",
    skill: "Linear equations in one variable",
    variants: [
      [7, 4, 10],
      [5, 6, 8],
      [9, 3, 12],
      [4, 7, 9],
      [11, 5, 7],
      [6, 8, 11],
    ],
    build: ([first, difference, n]) => {
      const solve = integerSolve(() => first! + (n! - 1) * difference!);
      return {
        prompt: `An arithmetic sequence has first term ${first} and common difference ${difference}. What is the ${ordinal(n!)} term?`,
        solve,
        explanation: `Start at ${first} and add the common difference ${n! - 1} times, which gives ${solve()}.`,
      };
    },
  },
  {
    domain: "Advanced Math",
    skill: "Nonlinear functions",
    variants: [
      [4, 3, 5, 2],
      [6, 4, 3, 3],
      [2, 7, 4, 2],
      [5, 5, 6, 2],
      [8, 2, 7, 3],
      [3, 9, 4, 2],
    ],
    build: ([start, times, add, timesAgain]) => {
      const solve = integerSolve(() => (start! * times! + add!) * timesAgain!);
      return {
        prompt: `Start with ${start}. Multiply by ${times}, then add ${add}, then multiply by ${timesAgain}. What is the final value?`,
        solve,
        explanation: `Applying the three steps in order gives ${solve()}.`,
      };
    },
  },
  {
    domain: "Problem-Solving and Data Analysis",
    skill: "Ratios and rates",
    variants: [
      [5, 2, 15],
      [4, 3, 20],
      [7, 2, 21],
      [3, 5, 12],
      [6, 5, 18],
      [8, 3, 24],
    ],
    build: ([flourPart, oatsPart, flour]) => {
      const solve = integerSolve(() => (flour! / flourPart!) * oatsPart!);
      return {
        prompt: `Flour and oats are mixed in the ratio ${flourPart} to ${oatsPart}. The mix uses ${flour} cups of flour. How many cups of oats does it use?`,
        solve,
        explanation: `Scale the ratio so the flour amount is ${flour} cups. The oats amount is ${solve()} cups.`,
      };
    },
  },
  {
    domain: "Problem-Solving and Data Analysis",
    skill: "Ratios and rates",
    variants: [
      [48, 2, 36, 3],
      [40, 3, 55, 2],
      [30, 4, 45, 2],
      [25, 2, 40, 5],
      [60, 1, 42, 4],
      [35, 3, 28, 2],
    ],
    build: ([speed, hours, laterSpeed, laterHours]) => {
      const solve = integerSolve(() => speed! * hours! + laterSpeed! * laterHours!);
      return {
        prompt: `A bus travels at a constant speed of ${speed} miles per hour for ${hours} hours, stops, and then travels at ${laterSpeed} miles per hour for ${laterHours} hours. How many miles does the bus travel in all?`,
        solve,
        explanation: `Add the distance from each part of the trip. The total is ${solve()} miles.`,
      };
    },
  },
  {
    domain: "Algebra",
    skill: "Linear equations in one variable",
    variants: [
      [24, 4, 6],
      [18, 5, 7],
      [15, 6, 9],
      [22, 3, 8],
      [30, 4, 5],
      [16, 7, 4],
    ],
    build: ([price, count, fee]) => {
      const solve = integerSolve(() => price! * count! + fee!);
      return {
        prompt: `Each ticket costs ${price} dollars, and a single service fee of ${fee} dollars is charged once for the whole order. What is the total cost, in dollars, of ${count} tickets?`,
        solve,
        explanation: `The tickets cost ${price! * count!} dollars before the single fee, so the total is ${solve()}.`,
      };
    },
  },
  {
    domain: "Problem-Solving and Data Analysis",
    skill: "One-variable data",
    variants: [
      [78, 84, 90, 88],
      [70, 80, 90, 85],
      [82, 76, 88, 86],
      [65, 75, 85, 80],
      [90, 92, 94, 93],
      [72, 81, 87, 84],
    ],
    build: ([first, second, third, target]) => {
      const solve = integerSolve(() => target! * 4 - (first! + second! + third!));
      return {
        prompt: `A student already has scores of ${first}, ${second}, and ${third}. What score is needed on a fourth test so that the average of the four scores is ${target}?`,
        solve,
        explanation: `Four scores averaging ${target} must sum to ${target! * 4}, so the fourth score is ${solve()}.`,
      };
    },
  },
];

function sourceKey(dateKey: string, section: "rw" | "math", questionNumber: number): string {
  return `original-hard-${dateKey}-${section}-${String(questionNumber).padStart(2, "0")}`;
}

export function originalHardMathItems(): OriginalHardMathItem[] {
  if (MATH_FAMILIES.length !== 15) throw new Error("Expected 15 math families.");
  const items: OriginalHardMathItem[] = [];
  DATES.forEach((dateKey, dateIndex) => {
    for (let index = 0; index < 30; index += 1) {
      const family = MATH_FAMILIES[index % 15]!;
      const variant = family.variants[dateIndex * 2 + Math.floor(index / 15)];
      if (!variant) throw new Error(`Missing math variant for ${family.skill}.`);
      const built = family.build(variant);
      const questionNumber = 30 - index;
      const placed = choicesFor(built.solve(), dateIndex * 30 + index);
      items.push({
        dateKey,
        section: "math",
        questionNumber,
        sourceKey: sourceKey(dateKey, "math", questionNumber),
        prompt: built.prompt,
        stimulus: null,
        choices: placed.choices,
        correctAnswer: placed.correctAnswer,
        explanation: built.explanation,
        domain: family.domain,
        skill: family.skill,
        solve: built.solve,
      });
    }
  });
  return items;
}

const CRAFT: ReadonlyArray<{
  noun: string;
  adjective: string;
  person: string;
  word: string;
  frame: "outcome" | "review";
}> = [
  { noun: "expedition", adjective: "arduous", person: "leader", word: "worthwhile", frame: "outcome" },
  { noun: "negotiation", adjective: "contentious", person: "mediator", word: "constructive", frame: "review" },
  { noun: "rehearsal", adjective: "chaotic", person: "director", word: "coherent", frame: "outcome" },
  { noun: "harvest", adjective: "meager", person: "farmer", word: "heartening", frame: "review" },
  { noun: "voyage", adjective: "precarious", person: "captain", word: "reassuring", frame: "outcome" },
  { noun: "manuscript", adjective: "flawed", person: "editor", word: "valuable", frame: "review" },
  { noun: "campaign", adjective: "grueling", person: "organizer", word: "commendable", frame: "outcome" },
  { noun: "experiment", adjective: "sparse", person: "chemist", word: "promising", frame: "review" },
  { noun: "restoration", adjective: "costly", person: "curator", word: "durable", frame: "outcome" },
  { noun: "debate", adjective: "disputed", person: "moderator", word: "lucid", frame: "review" },
  { noun: "crossing", adjective: "harsh", person: "guide", word: "impressive", frame: "outcome" },
  { noun: "audit", adjective: "bleak", person: "analyst", word: "beneficial", frame: "review" },
  { noun: "summit", adjective: "dismal", person: "climber", word: "triumphant", frame: "outcome" },
  { noun: "trial", adjective: "opaque", person: "attorney", word: "favorable", frame: "review" },
  { noun: "census", adjective: "delayed", person: "clerk", word: "hopeful", frame: "outcome" },
  { noun: "excavation", adjective: "taxing", person: "researcher", word: "fruitful", frame: "review" },
  { noun: "symposium", adjective: "bitter", person: "host", word: "worthwhile", frame: "outcome" },
  { noun: "treaty", adjective: "frayed", person: "diplomat", word: "constructive", frame: "review" },
  { noun: "portrait", adjective: "grim", person: "painter", word: "coherent", frame: "outcome" },
  { noun: "forecast", adjective: "thorny", person: "forecaster", word: "heartening", frame: "review" },
  { noun: "inquiry", adjective: "turbulent", person: "inspector", word: "reassuring", frame: "outcome" },
  { noun: "recital", adjective: "scant", person: "soloist", word: "valuable", frame: "review" },
  { noun: "merger", adjective: "uneven", person: "executive", word: "commendable", frame: "outcome" },
  { noun: "survey", adjective: "severe", person: "surveyor", word: "promising", frame: "review" },
];

const CRAFT_DISTRACTORS = [
  "disastrous",
  "pointless",
  "hollow",
  "futile",
  "muddled",
  "trivial",
  "rambling",
  "barren",
  "gloomy",
  "wasteful",
  "shallow",
  "negligible",
  "confusing",
];

const INFORMATION: ReadonlyArray<{ lead: string; claim: string; supported: string }> = [
  {
    lead: "Biologists followed a pod along the coast.",
    claim: "The seals returned to the rocky inlet each spring.",
    supported: "The seals returned to the rocky inlet.",
  },
  {
    lead: "The studio kept the door shut.",
    claim: "The pottery kiln cooled for several hours.",
    supported: "The pottery kiln cooled for several hours.",
  },
  {
    lead: "Plumbers worked before sunrise.",
    claim: "Copper pipes leaked inside the basement wall.",
    supported: "Copper pipes leaked inside the basement wall.",
  },
  {
    lead: "Parents filled the lobby.",
    claim: "The choir rehearsed quietly before the concert.",
    supported: "The choir rehearsed quietly before the concert.",
  },
  {
    lead: "A ranger marked the trail.",
    claim: "Migrating cranes nested beside the marsh.",
    supported: "Migrating cranes nested beside the marsh.",
  },
  {
    lead: "Volunteers arrived with cotton gloves.",
    claim: "The archive scanned fragile letters overnight.",
    supported: "The archive scanned fragile letters.",
  },
  {
    lead: "The cabin sits miles from town.",
    claim: "Solar panels powered the remote cabin.",
    supported: "Solar panels powered the remote cabin.",
  },
  {
    lead: "Class ended after the titration.",
    claim: "The chemist measured alkaline samples twice.",
    supported: "The chemist measured alkaline samples.",
  },
  {
    lead: "Visibility dropped near the channel.",
    claim: "Harbor pilots guided tankers through fog.",
    supported: "Harbor pilots guided tankers through fog.",
  },
  {
    lead: "The opening chapter is brief.",
    claim: "The novel describes abandoned orchards.",
    supported: "The novel describes abandoned orchards.",
  },
  {
    lead: "The class walked south from campus.",
    claim: "Students mapped erosion along the riverbank.",
    supported: "Students mapped erosion along the riverbank.",
  },
  {
    lead: "Conservators worked under dim lamps.",
    claim: "The museum restored faded tapestries.",
    supported: "The museum restored faded tapestries.",
  },
  {
    lead: "Crews stayed on site all weekend.",
    claim: "Engineers tested durable bridges after floods.",
    supported: "Engineers tested durable bridges.",
  },
  {
    lead: "The kitchen lights came on early.",
    claim: "The baker proofed sourdough before dawn.",
    supported: "The baker proofed sourdough before dawn.",
  },
  {
    lead: "The notebook was almost full.",
    claim: "Field notes recorded unusual beetles.",
    supported: "Field notes recorded unusual beetles.",
  },
  {
    lead: "Nurses checked the temperature log.",
    claim: "The clinic stored vaccines in locked freezers.",
    supported: "The clinic stored vaccines in locked freezers.",
  },
  {
    lead: "The observatory dome was open.",
    claim: "Astronomers tracked distant comets nightly.",
    supported: "Astronomers tracked distant comets.",
  },
  {
    lead: "The grove needed a dry afternoon.",
    claim: "The gardeners pruned mature olive trees.",
    supported: "The gardeners pruned mature olive trees.",
  },
  {
    lead: "The boat anchored outside the lagoon.",
    claim: "Divers surveyed coral beneath the reef.",
    supported: "Divers surveyed coral beneath the reef.",
  },
  {
    lead: "The deadline was the following Monday.",
    claim: "The editor revised lengthy footnotes.",
    supported: "The editor revised lengthy footnotes.",
  },
  {
    lead: "The crew brought spare coils.",
    claim: "Workers replaced brittle cables underground.",
    supported: "Workers replaced brittle cables.",
  },
  {
    lead: "The visit lasted three villages.",
    claim: "The poet collected regional folktales.",
    supported: "The poet collected regional folktales.",
  },
  {
    lead: "Flashlights stayed covered.",
    claim: "Rangers counted nesting turtles at midnight.",
    supported: "Rangers counted nesting turtles.",
  },
  {
    lead: "The jars sat in warm water.",
    claim: "The lab cultured marine bacteria.",
    supported: "The lab cultured marine bacteria.",
  },
];

const INFO_DISTRACTORS = [
  "Funding for the laboratory increased sharply.",
  "Winter storms damaged the wooden docks.",
  "The research budget doubled after review.",
];

const CONVENTIONS: ReadonlyArray<[string, string]> = [
  ["bundle", "letters"],
  ["collection", "essays"],
  ["stack", "crates"],
  ["batch", "samples"],
  ["catalog", "records"],
  ["library", "volumes"],
  ["anthology", "poems"],
  ["portfolio", "sketches"],
  ["assortment", "tools"],
  ["inventory", "goods"],
  ["shipment", "parcels"],
  ["bouquet", "roses"],
  ["box", "medals"],
  ["folder", "contracts"],
  ["packet", "seeds"],
  ["album", "photographs"],
  ["chest", "linens"],
  ["basket", "apples"],
  ["pile", "quilts"],
  ["row", "cabinets"],
  ["carton", "slides"],
];

const VERB_CHOICES = ["is", "was", "are", "were"];

const THEREFORE: ReadonlyArray<[string, string]> = [
  ["The ferry was delayed by ice.", "passengers waited on the dock until noon."],
  ["The mountain road was closed by snow.", "the bus departure was postponed until morning."],
  ["The studio pipes were frozen overnight.", "the recording session was rescheduled for Friday."],
  ["The harbor was closed after the squall.", "travelers waited in the terminal."],
  ["The exhibition opening was delayed by rain.", "the curator postponed the reception."],
  ["The north gate was frozen shut.", "visitors waited beside the courtyard."],
  ["The evening train was delayed outside the city.", "the connecting coach was rescheduled."],
  ["The reading room was closed for repairs.", "scholars postponed their visit."],
  ["The footbridge was frozen before dawn.", "hikers waited at the trailhead."],
  ["The coastal flight was delayed by fog.", "passengers waited at the gate."],
  ["The workshop was closed for an inspection.", "the demonstration was rescheduled."],
];

const HOWEVER: ReadonlyArray<[string, string]> = [
  ["The grant proposal was approved in March.", "the equipment request was declined in April."],
  ["The first design succeeded in trials.", "the revised plan was rejected by the client."],
  ["The early petition was approved.", "the appeal for extra funds failed in committee."],
  ["The pilot program succeeded last spring.", "the expansion was declined the next month."],
  ["The short story was approved for the journal.", "the longer essay was rejected."],
  ["The choir audition succeeded.", "the request for a larger hall was rejected."],
  ["The safety test was approved.", "the request to skip a second test failed."],
  ["The mural sketch was approved.", "the proposal for neon lights was rejected."],
  ["The opening night succeeded.", "the request for a second week was declined."],
  ["The sample batch was approved.", "the full production run failed the next check."],
];

const TRANSITION_CHOICES = ["Therefore", "However", "For example", "Meanwhile"];

function placeTexts(correct: string, distractors: readonly string[], slot: number): {
  choices: BankChoice[];
  correctAnswer: string;
} {
  if (distractors.length !== 3) throw new Error("Expected three distractors.");
  if (distractors.includes(correct) || new Set(distractors).size !== 3) {
    throw new Error(`Distractors collided with ${correct}.`);
  }
  const texts = ["", "", "", ""];
  const at = slot % 4;
  texts[at] = correct;
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
    correctAnswer: LETTERS[at]!,
  };
}

function rwDomainOrder(): Array<"craft" | "info" | "conventions" | "expression"> {
  const order: Array<"craft" | "info" | "conventions" | "expression"> = [];
  for (let round = 0; round < 7; round += 1) order.push("craft", "info", "conventions", "expression");
  order.push("craft", "info");
  return order;
}

export function originalHardRwItems(): OriginalHardRwItem[] {
  if (CRAFT.length !== 24 || INFORMATION.length !== 24 || CONVENTIONS.length !== 21) {
    throw new Error("Reading-and-writing pools are the wrong length.");
  }
  if (THEREFORE.length !== 11 || HOWEVER.length !== 10) {
    throw new Error("Transition pools are the wrong length.");
  }
  const transitions: Array<{ before: string; after: string; word: "Therefore" | "However" }> = [];
  let thereforeIndex = 0;
  let howeverIndex = 0;
  for (let index = 0; index < 21; index += 1) {
    if (index % 2 === 0) {
      const pair = THEREFORE[thereforeIndex++]!;
      transitions.push({ before: pair[0], after: pair[1], word: "Therefore" });
    } else {
      const pair = HOWEVER[howeverIndex++]!;
      transitions.push({ before: pair[0], after: pair[1], word: "However" });
    }
  }
  const items: OriginalHardRwItem[] = [];
  DATES.forEach((dateKey, dateIndex) => {
    const craft = CRAFT.slice(dateIndex * 8, dateIndex * 8 + 8);
    const info = INFORMATION.slice(dateIndex * 8, dateIndex * 8 + 8);
    const conventions = CONVENTIONS.slice(dateIndex * 7, dateIndex * 7 + 7);
    const expression = transitions.slice(dateIndex * 7, dateIndex * 7 + 7);
    const cursors = { craft: 0, info: 0, conventions: 0, expression: 0 };
    rwDomainOrder().forEach((domain, index) => {
      const questionNumber = 30 - index;
      const slot = dateIndex * 30 + index;
      let stimulus = "";
      let prompt = "";
      let explanation = "";
      let skill = "";
      let domainName = "";
      let placed: { choices: BankChoice[]; correctAnswer: string };
      if (domain === "craft") {
        const row = craft[cursors.craft++]!;
        stimulus =
          row.frame === "outcome"
            ? `Although the ${row.noun} was ${row.adjective}, the ${row.person} called the outcome ___.`
            : `Although the ${row.noun} was ${row.adjective}, reviewers later called it ___.`;
        prompt = "Which choice completes the text with the most logical and precise word or phrase?";
        const start = (dateIndex * 8 + cursors.craft) % CRAFT_DISTRACTORS.length;
        const distractors: string[] = [];
        for (let step = 0; distractors.length < 3; step += 1) {
          const word = CRAFT_DISTRACTORS[(start + step) % CRAFT_DISTRACTORS.length]!;
          if (word !== row.word && !distractors.includes(word)) distractors.push(word);
        }
        placed = placeTexts(row.word, distractors, slot);
        explanation = `Although signals a contrast with ${row.adjective}, so the precise word is ${row.word}.`;
        skill = "Words in Context";
        domainName = "Craft and Structure";
      } else if (domain === "info") {
        const row = info[cursors.info++]!;
        stimulus = `${row.lead} ${row.claim}`;
        prompt = "Which choice is supported by the text?";
        placed = placeTexts(row.supported, INFO_DISTRACTORS, slot);
        explanation = `Only one choice uses a claim that the text actually states: ${row.supported}`;
        skill = "Command of Evidence";
        domainName = "Information and Ideas";
      } else if (domain === "conventions") {
        const conventionIndex = dateIndex * 7 + cursors.conventions;
        const row = conventions[cursors.conventions++]!;
        const past = conventionIndex % 2 === 1;
        const [head, complement] = row;
        stimulus = past
          ? `The ${head} of ${complement} ___ stored in the archive last year.`
          : `The ${head} of ${complement} ___ stored in the archive beside the maps.`;
        prompt = "Which choice completes the text so that it conforms to the conventions of Standard English?";
        const verb = past ? "was" : "is";
        placed = placeTexts(verb, VERB_CHOICES.filter((choice) => choice !== verb), slot);
        explanation = past
          ? `${head} is singular, and last year requires the past verb was.`
          : `${head} is singular, and the sentence has no past-time cue, so the verb is is.`;
        skill = "Form, Structure, and Sense";
        domainName = "Standard English Conventions";
      } else {
        const row = expression[cursors.expression++]!;
        stimulus = `${row.before} ___, ${row.after}`;
        prompt = "Which choice completes the text with the most logical transition?";
        placed = placeTexts(row.word, TRANSITION_CHOICES.filter((choice) => choice !== row.word), slot);
        explanation =
          row.word === "Therefore"
            ? "The second clause is a result of the first, so Therefore is the logical transition."
            : "The second clause contrasts with the first, so However is the logical transition.";
        skill = "Transitions";
        domainName = "Expression of Ideas";
      }
      items.push({
        dateKey,
        section: "rw",
        questionNumber,
        sourceKey: sourceKey(dateKey, "rw", questionNumber),
        prompt,
        stimulus,
        choices: placed.choices,
        correctAnswer: placed.correctAnswer,
        explanation,
        domain: domainName,
        skill,
      });
    });
  });
  return items;
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
    sourceFiles: { origin: "original-hard-sat" },
    assets: [],
    extractGaps: GAPS,
    assignable: true,
  };
}

export function originalHardSatBankRecords(): ParsedBankRecord[] {
  return [...originalHardRwItems(), ...originalHardMathItems()].map((item) => toRecord(item));
}
