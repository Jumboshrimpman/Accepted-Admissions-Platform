import type { BankChoice, ExtractGaps, ParsedBankRecord } from "./sat-bank-import.ts";
import type { HardSatCandidate } from "./sat-set-difficulty.ts";
import { isOfficialModule2BankItem, isOriginalHardSatItem, satSection } from "./sat-set-difficulty.ts";

/**
 * Original hard reading-and-writing items for Taito's Oct 30 pre-work only.
 * Official module 2 reading is ordered by question type, so the late numbers
 * are mostly conventions and notes. These 22 items are the reading half.
 * The math half stays on the official module 2 pool.
 */

const DATE_KEY = "2026-10-30";
export const OCT30_HARD_RW_COUNT = 22;
export const OCT30_HARD_MATH_COUNT = 18;
export const OCT30_HARD_PREWORK_COUNT = OCT30_HARD_RW_COUNT + OCT30_HARD_MATH_COUNT;

const CRAFT = "Craft and Structure";
const INFO = "Information and Ideas";
const CONV = "Standard English Conventions";
const EXPR = "Expression of Ideas";

const WORD = "Which choice completes the text with the most logical and precise word or phrase?";
const CROSS = "Based on the texts, how would the author of Text 2 most likely respond to Text 1?";
const LOGIC = "Which choice most logically completes the text?";
const STANDARD = "Which choice completes the text so that it conforms to the conventions of Standard English?";
const notesIntro = "While researching a topic, a student has taken the following notes:";

function goal(sentence: string): string {
  return `${sentence} Which choice most effectively uses relevant information from the notes to accomplish this goal?`;
}

type Draft = {
  stimulus: string;
  prompt: string;
  correct: string;
  wrong: [string, string, string];
  explanation: string;
  note: string;
  domain: string;
  skill: string;
};

function r(
  stimulus: string,
  prompt: string,
  correct: string,
  wrong: [string, string, string],
  explanation: string,
  note: string,
  domain: string,
  skill: string,
): Draft {
  return { stimulus, prompt, correct, wrong, explanation, note, domain, skill };
}

/** Question 35 down to question 14. Inference, cross-text, hard vocabulary, synthesis, and boundaries. */
const DRAFTS: readonly Draft[] = [
  r(
    "The harbor clause does more than sound cold. It cancels the fishing right the treaty had granted, and the council adopted the clause in order to undo that grant. A short tone or a rude tone would have left the right standing. The minutes do not call the clause a ceremony. The clause is ___.",
    WORD,
    "inimical",
    ["brusque", "laconic", "ceremonial"],
    "The clause harms the granted right, so it is inimical to that right. Brusque names rudeness, laconic names brevity, and ceremonial names a rite, none of which is the cancellation the council voted for.",
    "Oct 30 vocabulary: inimical is required by a clause that cancels a treaty right, while brusque, laconic, and ceremonial name tone, length, or ritual.",
    CRAFT,
    "Words in Context",
  ),
  r(
    "The new valve makes the nightly inspection unnecessary. Mechanics no longer walk the line at dusk, and the log that used to record that walk has stopped. The valve does not move the inspection to morning, hide the old log, or repeat the walk. It was installed to ___ the inspection.",
    WORD,
    "obviate",
    ["postpone", "conceal", "duplicate"],
    "A valve that removes the need for the inspection obviates it. Postpone would only move the walk, conceal would hide the log, and duplicate would repeat the walk, all of which the passage rules out.",
    "Oct 30 vocabulary: obviate fits a valve that removes the need for a nightly inspection, unlike postpone, conceal, or duplicate.",
    CRAFT,
    "Words in Context",
  ),
  r(
    "The editor returned every page over a comma the style sheet marks as optional. She did not skip pages, and she did not miss the commas the sheet requires. Colleagues who call the habit sloppy have not watched her work. Her standard was ___.",
    WORD,
    "fastidious",
    ["careless", "cursory", "lax"],
    "Sending back every optional comma, while still catching the required ones, is a fastidious standard. Careless, cursory, and lax would describe skipped pages or missed requirements, which the passage denies.",
    "Oct 30 vocabulary: fastidious fits an editor who rejects even optional commas, while careless, cursory, and lax describe the sloppiness the passage denies.",
    CRAFT,
    "Words in Context",
  ),
  r(
    "The council voted before the survey arrived and before the written dissent was read aloud. The vote was not delayed until after those papers, and it was not the product of a long debate. Members who wanted more time did not get it. The vote was ___.",
    WORD,
    "precipitate",
    ["deliberate", "tardy", "measured"],
    "A vote taken before the survey and the dissent, without a long debate, is precipitate. Deliberate and measured would require that debate, and tardy would require a delay the passage denies.",
    "Oct 30 vocabulary: precipitate fits a vote rushed ahead of the survey and the dissent, unlike deliberate, tardy, or measured.",
    CRAFT,
    "Words in Context",
  ),
  r(
    "Judges who ruled against the advocate still copied her citations, and opposing counsel asked for more days to answer the brief. The brief was not set aside, and it was not a restatement of a textbook chapter. Even the losing side treated it as a force to be met. The brief was ___.",
    WORD,
    "redoubtable",
    ["negligible", "obscure", "derivative"],
    "A brief that forces extra preparation from the other side, and that is copied even by judges who disagree, is redoubtable. Negligible, obscure, and derivative would describe a brief that was ignored or borrowed, which this one was not.",
    "Oct 30 vocabulary: redoubtable fits a brief opponents had to answer at length, unlike negligible, obscure, or derivative.",
    CRAFT,
    "Words in Context",
  ),
  r(
    "Text 1\nThe 1924 harbor report treats the breakwater as one pour finished before the winter storms. It cites a single October invoice and treats the lack of a second bill as proof that later concrete was never placed. The lantern pier, the report says, was bolted to that pour, so a crack in the pier would date the concrete itself. Repairs paid from another account sit outside the report. The authors call the October invoice the last word on the structure.\nText 2\nCores drilled in 2016 show a cold joint a meter under the lantern bolts. The upper lift contains gravel the 1924 supplier did not stock. Clay in the joint holds pollen from plants that reached the harbor only in the 1930s. The cores leave the October invoice as a record of the first pour. They show a later lift sitting on that pour.",
    CROSS,
    "The cores show the timing in the first account is too late.",
    [
      "The cores show the timing in the first account is too early.",
      "The cores show the pattern holds in a further case.",
      "The cores show the October invoice was never issued.",
    ],
    "Text 1 dates the whole breakwater to a single pour finished before the winter storms. Text 2 finds a later lift above that pour, so the first dating is too late. The cores do not say the invoice was never issued, and they are not an extra example of a single pour.",
    "Oct 30 cross-text: a later concrete lift undercuts a report that dates the whole breakwater to one pre-storm pour.",
    CRAFT,
    "Cross-Text Connections",
  ),
  r(
    "Text 1\nGuild minutes say every finished chart was read aloud to a second clerk before the ink was treated as dry. The preface calls that reading part of making a chart, and it states the rule with no exception. Draft sheets, the preface says, are not charts and sit outside the rule. Silence in the minutes is treated as proof the second reading always happened for a finished chart.\nText 2\nWorking sheets from the same loft carry corrections in the first hand and no second-reader mark. Those sheets are still drafts: they lack the finished-chart stamp the preface requires. The note does not redate the finished charts. It says the second-reading rule stops at the draft stage, a limit the preface never states.",
    CROSS,
    "The sheets show the stated rule fails under a condition the first account omits.",
    [
      "The sheets show the timing in the first account is too late.",
      "The sheets show the pattern holds in a further case.",
      "The sheets show the second reading was performed on every draft.",
    ],
    "Text 1 states the second-reading rule without an exception and sets drafts outside its concern. Text 2 says the rule stops for drafts, a condition the preface does not state. That is a limit, not a new date and not proof that drafts were read aloud.",
    "Oct 30 cross-text: draft sheets show a second-reading rule that the minutes treat as exceptionless actually stops before a chart is finished.",
    CRAFT,
    "Cross-Text Connections",
  ),
  r(
    "Text 1\nCataloguers date the iron stamps to after the 1888 fire. They read the workshop diary as silent on iron before that year and treat a pre-fire sketch as decorative rather than a tool drawing. The diary, they add, lists only wooden stamps until the rebuilding contract. They treat that list as a complete inventory, not as a partial one, and they do not cite receipts from before the fire.\nText 2\nA bin under the burnt floor held an iron stamp whose wooden handle is charred on one side only. The char matches the 1888 fire, and the stamp's letters match a pre-fire receipt the cataloguers did not cite. The bin does not prove every stamp was iron. It does show this iron stamp was already in the shop when the fire started.",
    CROSS,
    "The bin shows the timing in the first account is too late.",
    [
      "The bin shows the timing in the first account is too early.",
      "The bin shows every stamp in the shop was iron.",
      "The bin shows the diary list is a complete inventory.",
    ],
    "Text 1 puts iron stamps after the 1888 fire. Text 2 finds an iron stamp already in the shop when the fire started, so that dating is too late. The bin does not say every stamp was iron, and it cuts against the claim that the diary list is complete.",
    "Oct 30 cross-text: a charred iron stamp shows cataloguers dated iron tooling to after a fire that the stamp itself had already survived.",
    CRAFT,
    "Cross-Text Connections",
  ),
  r(
    "Text 1\nThe ferry ledgers claim the winter discount applied only on weekdays. Weekend fares, the ledgers say, stayed at the full price, and a margin note says the rule was checked against every winter week. The clerks treat a missing weekend discount as the normal case, not as a gap in the books. They do not claim the discount was a summer rule.\nText 2\nA ticket stub from a Sunday in that same winter shows the full fare, and the passenger's diary records the same price. The stub is one Sunday, not the whole season. It fits the ledgers' weekday-only rule rather than breaking it, and it does not move the rule into another season.",
    CROSS,
    "The stub shows the pattern holds in a further case.",
    [
      "The stub shows the stated rule fails under a condition the first account omits.",
      "The stub shows the timing in the first account is too late.",
      "The stub shows weekend fares were discounted all winter.",
    ],
    "Text 1 says weekend winter fares stayed full. Text 2's Sunday stub shows that full fare again, so it is a further case of the same rule. It does not break the rule, redate it, or show a weekend discount.",
    "Oct 30 cross-text: a Sunday full-fare stub supports the ledgers' weekday-only winter discount instead of overturning it.",
    CRAFT,
    "Cross-Text Connections",
  ),
  r(
    "A dock permit is valid only when the harbor stamp and the witness signature are both present. The file has the stamp. The signature line is blank, and a later clerk wrote that the witness never came. The fee was paid in full. The payment does not fill the blank line. The permit ___.",
    LOGIC,
    "is not valid, because the witness signature is missing",
    [
      "is valid, because the harbor stamp is present",
      "is valid, because the fee was paid in full",
      "proves the harbor stamp was never applied",
    ],
    "Validity needs both the stamp and the signature. The stamp is present and the signature is blank, so the permit is not valid. The fee does not replace the signature, and the stamp was in fact applied.",
    "Oct 30 inference: a dock permit needs a stamp and a witness signature together, so a paid file with a blank signature line is still invalid.",
    INFO,
    "Inferences",
  ),
  r(
    "The lab predicted that heat stress would raise bleaching and lower recruitment together. Over the watched month, bleaching rose. Recruitment rose as well. The boats logged the same heat the lab had named. The paired prediction ___.",
    LOGIC,
    "is not confirmed, because recruitment moved opposite the prediction",
    [
      "is confirmed, because bleaching rose as predicted",
      "is confirmed, because bleaching and recruitment both rose",
      "shows the reef never experienced the logged heat",
    ],
    "The prediction required bleaching up and recruitment down. Recruitment rose, so the pair is not confirmed. Bleaching alone is only half of the prediction, and the log says the heat did occur.",
    "Oct 30 inference: a paired heat prediction fails when bleaching rises but recruitment rises with it instead of falling.",
    INFO,
    "Inferences",
  ),
  r(
    "The archive releases a letter only when the donor has died and the letter is at least seventy years old. The donor died last winter. The letter is forty years old. A clerk has already prepared a folder. The folder does not change the age rule. The archive ___.",
    LOGIC,
    "cannot release the letter, because it is not yet seventy years old",
    [
      "must release the letter, because the donor has died",
      "cannot release the letter, because the donor is still living",
      "must release the letter, because a folder has been prepared",
    ],
    "Release needs both the donor's death and an age of at least seventy years. The donor has died, but the letter is only forty, so it stays unreleased. The prepared folder is not one of the two conditions.",
    "Oct 30 inference: an archive rule needs death and a seventy-year age together, so a forty-year letter stays closed after the donor's death.",
    INFO,
    "Inferences",
  ),
  r(
    "Three workshops fired the same clay. Only the workshop that changed both the glaze and the peak temperature lost the crack. The workshop that changed only the glaze kept the crack, and so did the workshop that changed only the temperature. No workshop kept both settings and lost the crack. The trial ___.",
    LOGIC,
    "does not show which single change removed the crack",
    [
      "shows the glaze change alone removed the crack",
      "shows the temperature change alone removed the crack",
      "shows that keeping both settings the same removed the crack",
    ],
    "The crack disappeared only when both changes were present, and each change alone left the crack. The trial therefore cannot credit either change by itself, and it cannot credit leaving both settings alone.",
    "Oct 30 inference: a crack that vanishes only when glaze and temperature change together cannot be credited to either change alone.",
    INFO,
    "Inferences",
  ),
  r(
    `${notesIntro}\n- The night shift cleared the backlog before dawn.\n- The day shift left that same backlog unchanged.\n- The office bought new chairs in March.`,
    goal("The student wants to emphasize the contrast between the night shift and the day shift."),
    "The night shift cleared the backlog before dawn, but the day shift left it unchanged.",
    [
      "The night shift cleared the backlog before dawn.",
      "The day shift left that same backlog unchanged.",
      "The office bought new chairs in March and set them by the unused window.",
    ],
    "The goal needs the night shift and the day shift set against each other. Either shift alone, and the chair purchase, leaves out half of that contrast.",
    "Oct 30 synthesis: night shift and day shift must both appear, so a note about only one shift or about new chairs misses the contrast.",
    EXPR,
    "Rhetorical Synthesis",
  ),
  r(
    `${notesIntro}\n- Most of the watched reef bleached in August.\n- The deep ledge of that reef did not bleach.\n- A donor paid for the survey boat in June.`,
    goal("The student wants to qualify the bleaching claim by noting where it did not hold."),
    "Most of the watched reef bleached in August, though the deep ledge did not.",
    [
      "Most of the watched reef bleached in August.",
      "The deep ledge of that reef did not bleach.",
      "A donor paid for the survey boat in June and kept the receipt.",
    ],
    "A qualification has to state the bleaching and the ledge that did not bleach. The broad claim alone, the exception alone, and the boat payment each miss that pair.",
    "Oct 30 synthesis: a bleaching claim is qualified only when the deep ledge exception is kept beside it, not replaced by the donor note.",
    EXPR,
    "Rhetorical Synthesis",
  ),
  r(
    `${notesIntro}\n- Dr. Ibarra measured the silt under the pier.\n- That silt layer predates the dredging by decades.\n- The crew ate lunch on the barge.`,
    goal("The student wants to introduce Dr. Ibarra and the finding that came from her measurement."),
    "Dr. Ibarra measured a silt layer under the pier that predates the dredging by decades.",
    [
      "Dr. Ibarra measured the silt under the pier.",
      "That silt layer predates the dredging by decades.",
      "The crew ate lunch on the barge and stored the baskets below deck.",
    ],
    "The introduction needs both the researcher's name and the finding that the silt predates the dredging. The name alone, the finding alone, and the lunch detail each drop half of that goal.",
    "Oct 30 synthesis: introducing Dr. Ibarra requires her name and the predredging silt finding together, not the crew's lunch.",
    EXPR,
    "Rhetorical Synthesis",
  ),
  r(
    `${notesIntro}\n- The 1910 map and the 1912 map both mark the stone quay.\n- The 1912 map uses a finer scale than the 1910 map.\n- The archive bought lamps in April.`,
    goal("The student wants to highlight the similarity between the 1910 map and the 1912 map."),
    "The 1910 map and the 1912 map both mark the stone quay.",
    [
      "The 1912 map uses a finer scale than the 1910 map.",
      "Only the 1910 map marks the stone quay.",
      "The archive bought lamps in April and hung them beside the door.",
    ],
    "The similarity is that both maps mark the quay. The finer scale is a difference, the claim that only one map marks the quay contradicts the notes, and the lamps are unrelated.",
    "Oct 30 synthesis: the shared quay mark is the similarity, while a finer scale, a one-map claim, and the lamp purchase do not highlight it.",
    EXPR,
    "Rhetorical Synthesis",
  ),
  r(
    "The surveyor recorded one result that settled the dispute___",
    STANDARD,
    ": the upper lift was newer than the invoice.",
    [
      "; a thin seam of clay under the bolts.",
      ", the upper lift was newer than the invoice.",
      "the upper lift was newer than the invoice.",
    ],
    "An independent clause that announces a result takes a colon before the clause that states it. The semicolon option is only a noun phrase, the comma joins two independent clauses, and the bare wording is a run-on.",
    "Oct 30 boundaries: a colon can introduce the result clause, while a semicolon fragment, a comma splice, and a run-on cannot.",
    CONV,
    "Boundaries",
  ),
  r(
    "The ledger closed in May___",
    STANDARD,
    "; a different clerk filed the June tally.",
    [
      ", a different clerk filed the June tally.",
      ": a different clerk.",
      "a different clerk filed the June tally.",
    ],
    "Two independent clauses can be joined with a semicolon. A comma between them is a splice, a colon before a bare noun phrase does not introduce a clause, and no mark at all is a run-on.",
    "Oct 30 boundaries: a semicolon joins the May closing to the June filing, while a comma splice, a colon fragment, and a run-on do not.",
    CONV,
    "Boundaries",
  ),
  r(
    "The only pier___still holds the city lantern.",
    STANDARD,
    "—the one built before the storms—",
    [
      "—the one built before the storms.",
      ", the one built before the storms—",
      " the one built before the storms ",
    ],
    "A nonessential name for the pier needs a matching pair of dashes so the main clause continues. A dash closed by a period, a comma opened and a dash closed, and a bare insertion all leave the sentence broken.",
    "Oct 30 boundaries: a matching dash pair can set off the pier's description, while a broken pair or no punctuation cannot.",
    CONV,
    "Boundaries",
  ),
  r(
    "After the cores arrived from the lab___",
    STANDARD,
    ", the invoice date could not be maintained.",
    [
      " the invoice date could not be maintained.",
      "; the invoice date could not be maintained.",
      ": the cores were late.",
    ],
    "An introductory dependent clause takes a comma before the main clause. Omitting the comma fuses the clauses, a semicolon cannot follow a dependent clause, and the colon option does not state the result the sentence began.",
    "Oct 30 boundaries: a comma must follow the introductory clause about the cores, while a missing comma, a semicolon, or a colon fragment does not.",
    CONV,
    "Boundaries",
  ),
  r(
    "The clay was older than the invoice___",
    STANDARD,
    ", but the pollen in the joint was not.",
    [
      ", however, the pollen in the joint was not.",
      "; but the pollen in the joint was not.",
      " however the pollen in the joint was not.",
    ],
    "Two independent clauses take a comma with the coordinating conjunction but. However between commas is a splice, a semicolon should not stand immediately before but, and however with no punctuation is a run-on.",
    "Oct 30 boundaries: comma-plus-but joins the clay clause to the pollen clause, while a however splice, a semicolon before but, and a run-on do not.",
    CONV,
    "Boundaries",
  ),
];

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

function hashSeed(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let mixed = hash >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function shuffleWithSeed<T>(items: readonly T[], seedId: string): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const mixed = hashSeed(`${seedId}:${index}`) || 1;
    const swap = Math.floor((mixed / 4294967296) * (index + 1));
    const hold = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = hold;
  }
  return copy;
}

function placedChoices(correct: string, distractors: readonly string[], slot: number, id: string): {
  choices: BankChoice[];
  correctAnswer: string;
} {
  if (distractors.length !== 3) throw new Error("Expected three distractors.");
  if (distractors.includes(correct) || new Set(distractors).size !== 3) {
    throw new Error(`Distractors collided with ${correct}.`);
  }
  const rest = shuffleWithSeed(distractors, `${id}:wrongs`);
  const texts = ["", "", "", ""];
  texts[slot] = correct;
  let next = 0;
  for (let index = 0; index < texts.length; index += 1) {
    if (texts[index]) continue;
    texts[index] = rest[next]!;
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

export type Oct30HardRwItem = {
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
  correctText: string;
};

export function oct30HardRwSourceKey(questionNumber: number): string {
  return `original-hard-${DATE_KEY}-rw-${String(questionNumber).padStart(2, "0")}`;
}

export function isOct30HardRwSourceKey(sourceKey: string | null | undefined): boolean {
  return /^original-hard-2026-10-30-rw-\d{2}$/.test(sourceKey ?? "");
}

export function oct30HardRwItems(): Oct30HardRwItem[] {
  if (DRAFTS.length !== OCT30_HARD_RW_COUNT) {
    throw new Error(`Expected ${OCT30_HARD_RW_COUNT} Oct 30 reading items.`);
  }
  const slots = shuffleWithSeed(
    Array.from({ length: DRAFTS.length }, (_, index) => index % 4),
    `${DATE_KEY}:rw:slots`,
  );
  return DRAFTS.map((draft, index) => {
    const questionNumber = 35 - index;
    const sourceKey = oct30HardRwSourceKey(questionNumber);
    const blanks = draft.stimulus.split("___").length - 1;
    if (blanks > 1) throw new Error(`${sourceKey} has ${blanks} blanks.`);
    const placed = placedChoices(draft.correct, draft.wrong, slots[index] ?? 0, sourceKey);
    return {
      dateKey: DATE_KEY,
      section: "rw" as const,
      questionNumber,
      sourceKey,
      prompt: draft.prompt,
      stimulus: draft.stimulus,
      choices: placed.choices,
      correctAnswer: placed.correctAnswer,
      explanation: draft.explanation,
      difficultyNote: draft.note,
      domain: draft.domain,
      skill: draft.skill,
      correctText: draft.correct,
    };
  });
}

export function oct30HardRwSourceKeys(): string[] {
  return oct30HardRwItems().map((item) => item.sourceKey);
}

export function oct30HardRwBankRecords(): ParsedBankRecord[] {
  return oct30HardRwItems().map((item) => ({
    sourceKey: item.sourceKey,
    dedupKey: item.sourceKey,
    examFamily: "sat",
    examVariant: "digital",
    practiceTestNumber: null,
    formCode: "original-hard",
    section: "rw",
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
    sourceFiles: { origin: "original-hard-sat-oct30", difficultyNote: item.difficultyNote },
    assets: [],
    extractGaps: GAPS,
    assignable: true,
  }));
}

export type Oct30BankFingerprint = {
  sourceKey: string;
  prompt: string;
  stimulus: string | null;
  correctAnswer: string;
  choices: unknown;
  officialExplanation: string | null;
  skill: string | null;
  domain: string | null;
};

function fingerprint(row: Oct30BankFingerprint): string {
  return JSON.stringify({
    prompt: row.prompt,
    stimulus: row.stimulus,
    correctAnswer: row.correctAnswer,
    choices: row.choices,
    officialExplanation: row.officialExplanation,
    skill: row.skill,
    domain: row.domain,
  });
}

/** Counts only. Callers log this plan before any write and skip the write when nothing changed. */
export function planOct30HardRwBankWrite(
  existing: readonly Oct30BankFingerprint[],
  records: readonly Oct30BankFingerprint[] = oct30HardRwBankRecords(),
): { insert: number; update: number; unchanged: number; writeKeys: string[] } {
  const byKey = new Map(existing.map((row) => [row.sourceKey, row]));
  const writeKeys: string[] = [];
  let insert = 0;
  let update = 0;
  let unchanged = 0;
  for (const record of records) {
    const prior = byKey.get(record.sourceKey);
    if (!prior) {
      insert += 1;
      writeKeys.push(record.sourceKey);
      continue;
    }
    if (fingerprint(prior) === fingerprint(record)) {
      unchanged += 1;
      continue;
    }
    update += 1;
    writeKeys.push(record.sourceKey);
  }
  return { insert, update, unchanged, writeKeys };
}

function byHardestFirst<T extends HardSatCandidate>(left: T, right: T): number {
  const questionDelta = right.questionNumber - left.questionNumber;
  if (questionDelta !== 0) return questionDelta;
  const leftTest = left.practiceTestNumber ?? 999;
  const rightTest = right.practiceTestNumber ?? 999;
  if (leftTest !== rightTest) return leftTest - rightTest;
  return left.sourceKey.localeCompare(right.sourceKey);
}

function dedupe<T extends HardSatCandidate>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    if (!item.sourceKey || seen.has(item.sourceKey)) continue;
    seen.add(item.sourceKey);
    unique.push(item);
  }
  return unique;
}

/**
 * True when one live pre-work list is the 22 Oct 30 reading items plus 18 other items.
 * The other 18 are the official math half.
 */
export function oct30HardRwPreworkIsCurrent(
  keys: readonly string[],
  expectedRw: readonly string[] = oct30HardRwSourceKeys(),
): boolean {
  if (keys.length !== OCT30_HARD_PREWORK_COUNT) return false;
  if (new Set(keys).size !== OCT30_HARD_PREWORK_COUNT) return false;
  const expected = new Set(expectedRw);
  if (expected.size !== OCT30_HARD_RW_COUNT) return false;
  let rw = 0;
  for (const key of keys) if (expected.has(key)) rw += 1;
  return rw === OCT30_HARD_RW_COUNT;
}

/**
 * Started work stays. An unattempted set that already has the 22 reading items stays.
 * Anything else unattempted is replaced.
 */
export function oct30HardRwPreworkAction(input: {
  attemptCount: number;
  assignmentKeyLists: readonly (readonly string[])[];
  expectedRwKeys?: readonly string[];
}): "blocked" | "unchanged" | "replace" {
  const expected = input.expectedRwKeys ?? oct30HardRwSourceKeys();
  if (input.attemptCount > 0) return "blocked";
  if (input.assignmentKeyLists.some((keys) => oct30HardRwPreworkIsCurrent(keys, expected))) {
    return "unchanged";
  }
  return "replace";
}

/**
 * Reading half: the 22 Oct 30 items. Math half: official module 2, hardest question
 * number first, keeping math already on an unattempted Oct 30 set when those keys
 * are still available.
 */
export function composeOct30HardPrework<T extends HardSatCandidate>(input: {
  pool: readonly T[];
  existingSourceKeys?: readonly string[];
  excludeSourceKeys?: ReadonlySet<string>;
}): { prework: T[]; complete: boolean } {
  const exclude = input.excludeSourceKeys ?? new Set<string>();
  const reading = dedupe(
    input.pool.filter((item) => isOct30HardRwSourceKey(item.sourceKey) && !exclude.has(item.sourceKey)),
  ).sort(byHardestFirst);
  if (reading.length < OCT30_HARD_RW_COUNT) return { prework: [], complete: false };
  const selectedRw = reading.slice(0, OCT30_HARD_RW_COUNT);
  const officialMath = dedupe(
    input.pool.filter(
      (item) =>
        !isOriginalHardSatItem(item) &&
        !isOct30HardRwSourceKey(item.sourceKey) &&
        satSection(item.section) === "math" &&
        isOfficialModule2BankItem(item) &&
        !exclude.has(item.sourceKey),
    ),
  );
  const mathByKey = new Map(officialMath.map((item) => [item.sourceKey, item]));
  const kept: T[] = [];
  const keptKeys = new Set<string>();
  for (const key of input.existingSourceKeys ?? []) {
    if (exclude.has(key) || keptKeys.has(key)) continue;
    const item = mathByKey.get(key);
    if (!item) continue;
    keptKeys.add(key);
    kept.push(item);
  }
  const sortedMath = [...officialMath].sort(byHardestFirst);
  let selectedMath: T[];
  if (kept.length >= OCT30_HARD_MATH_COUNT) {
    selectedMath = [...kept].sort(byHardestFirst).slice(0, OCT30_HARD_MATH_COUNT);
  } else {
    selectedMath = [...kept];
    for (const item of sortedMath) {
      if (selectedMath.length >= OCT30_HARD_MATH_COUNT) break;
      if (selectedMath.some((row) => row.sourceKey === item.sourceKey)) continue;
      selectedMath.push(item);
    }
  }
  if (selectedMath.length !== OCT30_HARD_MATH_COUNT) return { prework: [], complete: false };
  return { prework: [...selectedRw, ...selectedMath], complete: true };
}
