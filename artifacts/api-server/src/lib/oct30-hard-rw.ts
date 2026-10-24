import type { BankChoice, ExtractGaps, ParsedBankRecord } from "./sat-bank-import.ts";
import type { HardSatCandidate } from "./sat-set-difficulty.ts";
import { isOfficialModule2BankItem, isOriginalHardSatItem, satSection } from "./sat-set-difficulty.ts";

/**
 * Original hard reading-and-writing items for Taito's Oct 30 pre-work only.
 * Question numbers follow the digital SAT order: craft, information, expression,
 * then conventions. These 22 items are the reading half.
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
const STRUCTURE = "Which choice best describes the overall structure of the text?";
const PURPOSE = "Which choice best describes the main purpose of the text?";
const CROSS = "Based on the texts, how would the author of Text 2 most likely respond to Text 1?";
const IDEA = "Which choice best states the main idea of the text?";
const TRANS = "Which choice completes the text with the most logical transition?";
const LOGIC = "Which choice most logically completes the text?";
const STANDARD = "Which choice completes the text so that it conforms to the conventions of Standard English?";
const notesIntro = "While researching a topic, a student has taken the following notes:";

function weaken(topic: string): string {
  return `Which finding, if true, would most directly weaken the researchers' claim about ${topic}?`;
}

function support(topic: string): string {
  return `Which finding, if true, would most directly support the conservators' claim about ${topic}?`;
}

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

/**
 * Question 35 down to question 14.
 * Conventions, transitions, and synthesis sit at the high numbers.
 * Evidence, inferences, ideas, cross-text, structure, and vocabulary follow.
 */
const DRAFTS: readonly Draft[] = [
  r(
    "The ledger closed in May___",
    STANDARD,
    "; a different clerk filed the June tally.",
    [
      ", a different clerk filed the June tally.",
      ": a different clerk filed the June tally.",
      " a different clerk filed the June tally.",
    ],
    "The May closing and the June filing are separate independent clauses, so a semicolon can join them. A comma is a splice, a colon is wrong because the June filing does not explain the May closing, and no mark fuses the two clauses.",
    "Oct 30 boundaries: only the semicolon is standard between these two independent clauses; the comma, colon, and missing mark use the same words.",
    CONV,
    "Boundaries",
  ),
  r(
    "After the cores arrived from the lab___",
    STANDARD,
    ", the invoice date could not be maintained.",
    [
      "; the invoice date could not be maintained.",
      ": the invoice date could not be maintained.",
      " the invoice date could not be maintained.",
    ],
    "An introductory dependent clause takes a comma before the main clause. A semicolon and a colon both require an independent clause before them, and leaving the mark out runs the dependent clause into the main clause.",
    "Oct 30 boundaries: the introductory clause needs a comma, while a semicolon, a colon, and a missing mark keep the same words and break the sentence.",
    CONV,
    "Boundaries",
  ),
  r(
    "Each of the folios that the rival houses have disputed in print since the lawsuit ___ sealed in the vault today.",
    STANDARD,
    "is",
    ["are", "was", "were"],
    "Each is a singular subject, and today keeps the verb in the present, so the clause needs is. Are and were follow the nearer plural nouns, and was is singular but past.",
    "Oct 30 form: each stays singular across a long plural interrupter, and today rules out the past forms was and were.",
    CONV,
    "Form, Structure, and Sense",
  ),
  r(
    "Although the pigment flaked along the outer border, the figures kept the hue recorded in the 1490 inventory. ___ curators cleared the panel for display.",
    TRANS,
    "Accordingly,",
    ["However,", "For instance,", "Likewise,"],
    "Clearing the panel follows from the hue that survived, so Accordingly marks a result. However would oppose that survival, For instance would need an example of the hue, and Likewise would need a parallel action rather than a consequence.",
    "Oct 30 transition: the clearance is a result of the preserved hue, so the link is a consequence rather than a contrast, an example, or a similarity.",
    EXPR,
    "Transitions",
  ),
  r(
    `${notesIntro}\n- The 1912 map uses a finer scale than the 1910 map.\n- The 1910 map and the 1912 map both mark the stone quay.\n- The archive bought new lamps in April.`,
    goal("The student wants to emphasize only the difference in scale between the 1910 map and the 1912 map."),
    "The 1912 map uses a finer scale than the 1910 map.",
    [
      "The 1910 map and the 1912 map both mark the stone quay.",
      "The archive bought new lamps in April.",
      "The 1912 map uses a finer scale than the 1910 map, and both maps mark the stone quay.",
    ],
    "Only the finer scale is a difference. The shared quay is a similarity, the lamps are unrelated to the maps, and adding the quay to the scale sentence brings in a similarity the goal excludes.",
    "Oct 30 synthesis: the scale note alone meets a goal limited to the difference, while the quay, the lamps, and the scale-plus-quay sentence are all facts from the notes that miss that limit.",
    EXPR,
    "Rhetorical Synthesis",
  ),
  r(
    `${notesIntro}\n- Most of the watched reef bleached in August.\n- The survey left the deep ledge unvisited.\n- A donor paid for the survey boat in June.`,
    goal("The student wants to mention only a limit of where the survey could reach."),
    "The survey left the deep ledge unvisited.",
    [
      "Most of the watched reef bleached in August.",
      "A donor paid for the survey boat in June.",
      "The survey left the deep ledge unvisited, and most of the watched reef bleached in August.",
    ],
    "The reach of the survey is limited by the unvisited ledge. The bleaching result and the boat payment do not describe that reach, and pairing the ledge with the bleaching adds a result the goal does not ask for.",
    "Oct 30 synthesis: the unvisited ledge is the only note about where the survey could reach, while bleaching and the boat payment are true notes that serve a different point.",
    EXPR,
    "Rhetorical Synthesis",
  ),
  r(
    "A dock permit is filed only after two marks are on the form: the harbor stamp and the witness signature. This file contains the stamp. A margin note says the witness left the dock before signing. A fee receipt is clipped to the back of the form. The fee receipt ___.",
    LOGIC,
    "does not establish that the permit was filed, because the witness signature is still missing",
    [
      "establishes that the permit was filed, because the stamp and the receipt are both in the file",
      "establishes that the permit was filed, because the margin note places the witness at the dock",
      "shows that the harbor stamp is missing from the form",
    ],
    "Filing needs the stamp and the signature. The stamp is in the file, but the witness left before signing, so the signature is absent and the receipt cannot replace it. The stamp itself is not missing.",
    "Oct 30 inference: the receipt looks complete only if the two-mark rule and the margin note are ignored, and the stamp is already in the file.",
    INFO,
    "Inferences",
  ),
  r(
    "The lab's heat model treats bleaching and new colonies as a pair: the same stress that lifts bleaching is predicted to cut the number of new colonies. Divers logged the heat the model named. Along the shallow ledge, bleaching rose over the watched month. A separate count of new colonies on that ledge rose as well. The boats' temperature entries match the value the lab used. The colony count ___.",
    LOGIC,
    "keeps the heat model from being confirmed, because the model required new colonies to fall when bleaching rose",
    [
      "confirms the heat model, because bleaching rose on the shallow ledge",
      "confirms the heat model, because bleaching and the colony count rose together",
      "shows the ledge missed the water temperature the boats recorded",
    ],
    "The model requires bleaching to rise and new colonies to fall together. Colonies rose, so that pair is not confirmed. Bleaching alone is only half of the pair, a joint rise is the opposite of the prediction, and the boats recorded the modeled temperature.",
    "Oct 30 inference: a rising colony count blocks a paired heat prediction even though bleaching moved in the predicted direction.",
    INFO,
    "Inferences",
  ),
  r(
    "Letters in this archive are released only when two conditions are both met: the donor has died, and the letter is at least seventy years old. The donor of this letter died last winter. The letter is forty years old. A clerk has prepared a reading folder and set it on the release cart. The prepared folder ___.",
    LOGIC,
    "does not authorize release, because the letter has not reached the age the rule requires",
    [
      "authorizes release, because the donor has already died",
      "blocks release, because the donor is still living",
      "authorizes release, because placement on the release cart is the final condition the rule names",
    ],
    "Release needs both death and an age of at least seventy years. The donor has died, but a forty-year-old letter is still short of that age. The folder is not one of the two conditions, and the donor is not living.",
    "Oct 30 inference: a folder on the release cart cannot substitute for the age condition once the donor's death has already been met.",
    INFO,
    "Inferences",
  ),
  r(
    [
      "Researchers recorded bird counts at three marsh sites.",
      "",
      "Year\tCoast\tInland\tDelta",
      "2011\t36\t44\t21",
      "2015\t48\t33\t21",
      "2018\t29\t47\t22",
      "",
      "From 2015 to 2018, the Coast count and the Inland count ___.",
    ].join("\n"),
    "Which choice most effectively uses data from the table to complete the text?",
    "fell and rose, respectively, with Coast moving from 48 to 29 and Inland moving from 33 to 47.",
    [
      "rose and fell, respectively, with Coast moving from 36 to 48 and Inland moving from 44 to 33.",
      "fell and fell, respectively, with Coast moving from 48 to 29 and Inland moving from 33 to 47.",
      "fell and rose, respectively, with Coast moving from 48 to 29 and Delta moving from 21 to 22.",
    ],
    "From 2015 to 2018, Coast goes from 48 to 29 and Inland goes from 33 to 47. The first distractor uses 2011 to 2015, the second reverses the Inland direction, and the third substitutes the Delta row for Inland.",
    "Oct 30 quantitative evidence: Coast must fall and Inland must rise across 2015 to 2018, so an earlier span, a reversed Inland move, or the Delta row fails.",
    INFO,
    "Command of Evidence",
  ),
  r(
    "Plotted harbor readings stand at 16 units in 2013, 37 units in 2016, and 24 units in 2019. Plotted upriver readings stand at 19 units in 2013, 19 units in 2016, and 31 units in 2019. From 2016 to 2019, the harbor reading and the upriver reading ___.",
    "Which choice most effectively uses the gauge readings to complete the text?",
    "moved in opposite directions, with the harbor reading falling from 37 to 24 and the upriver reading rising from 19 to 31.",
    [
      "moved in opposite directions, with the harbor reading rising from 16 to 37 and the upriver reading staying at 19.",
      "fell together, with the harbor reading falling from 37 to 24 and the upriver reading falling from 19 to 31.",
      "moved in opposite directions, with the harbor reading falling from 37 to 24 and the upriver reading staying at 19.",
    ],
    "From 2016 to 2019 the harbor reading goes from 37 to 24 and the upriver reading goes from 19 to 31. The other choices use the 2013 to 2016 span, call the upriver rise a fall, or keep the upriver reading at the earlier plateau.",
    "Oct 30 quantitative evidence: the harbor fall and the upriver rise must both be read from 2016 to 2019, using only the readings in the text.",
    INFO,
    "Command of Evidence",
  ),
  r(
    "Field crews walked the marsh for three seasons after path lamps were installed. Nest boxes full in May were empty by June, and the loss was sharpest beside the new poles. The report claims the lamps caused the nesting decline, on the ground that the birds lost the darkness they had used.",
    weaken("the path lamps"),
    "Nesting fell by a similar amount in a nearby marsh that never received path lamps.",
    [
      "Nesting fell beside the new poles in the month the lamps were switched on.",
      "The poles were painted the same color as the older posts along the path.",
      "A boardwalk was lengthened in a marsh that never received path lamps.",
    ],
    "A similar nesting decline where the lamps were never installed undercuts lamps as the cause. A decline beside the new poles fits the claim, paint color does not test nesting, and a longer boardwalk reports no nesting result.",
    "Oct 30 textual evidence: nesting that falls without the lamps is the finding that cuts the lamp explanation, unlike a decline beside the poles or an unrelated path change.",
    INFO,
    "Command of Evidence",
  ),
  r(
    "Conservators claim that the green paint on top of the altar figures was added after 1490. They note a varnish between the figures and that green paint, and they treat the varnish as evidence that the green is not the original surface.",
    support("the green paint"),
    "A pigment in the varnish between the figures and the green paint was first sold in the eighteenth century.",
    [
      "The green paint uses the same pigment as the figures described in the 1490 inventory.",
      "A 1490 receipt lists the price paid for the panel's frame.",
      "The figures under the varnish match the faces described in the 1490 inventory.",
    ],
    "Green sitting above an eighteenth-century varnish must be later than 1490, which supports the claim. A shared 1490 pigment points the other way, the frame price does not date the paint, and a match for the figures does not date the green.",
    "Oct 30 textual evidence: a later pigment in the varnish under the green paint supports a post-1490 overpaint, while the frame price and the figures do not date that layer.",
    INFO,
    "Command of Evidence",
  ),
  r(
    "After the new sluice gates opened, grain yields on the lower plots rose through the dry season. Those same plots developed a thicker salt crust beside the gates as the weeks went on. Brick sizes and market-day closures appear in the margin of the ledger. The margin entries do not alter the two changes recorded for the lower plots.",
    IDEA,
    "On the lower plots, grain yields rose and the salt crust thickened.",
    [
      "On the lower plots, grain yields rose and the salt crust thinned.",
      "Grain yields rose on the lower plots.",
      "Grain yields rose and the salt crust thickened on every plot in the valley.",
    ],
    "The passage's field result is the pair on the lower plots: higher yields and a thicker crust. Thinning reverses the crust, yields alone drop half of the pair, and the valley extends the result past the plots that were described.",
    "Oct 30 central idea: the lower-plot result is a rise in yield together with a thicker salt crust, so a reversed, partial, or valley-wide summary misses it.",
    INFO,
    "Central Ideas and Details",
  ),
  r(
    "The diary's reception pages praise each host in a formal sentence. The entry written later the same night lists the concessions the ambassador had offered, none of which appear in the reception sentence. A reader who stops at the reception page sees only courtesy.",
    "According to the text, what did the ambassador's public praise leave out?",
    "Concessions recorded in an entry written later the same night",
    [
      "A fuller account of the concessions than the night entry gives",
      "The menus served at each reception",
      "Nothing, since the night entries repeat the reception sentences together with the concessions",
    ],
    "The night entry lists concessions that do not appear in the reception sentence, so the public praise leaves those concessions out. It is not a fuller account than the night entry, the menus are never mentioned, and the night entries do not repeat the reception sentences.",
    "Oct 30 detail: public praise omits concessions that the same night's entry records, rather than outdoing that entry or describing the reception menu.",
    INFO,
    "Central Ideas and Details",
  ),
  r(
    "Text 1\nThe 1924 harbor report treats the breakwater as one pour finished before the winter storms. It cites a single October invoice and treats the absence of a second bill as proof that later concrete was never placed. The lantern pier, the report says, was bolted to that pour, so a crack in the pier would date the concrete itself. Repairs paid from another account sit outside the report. The authors call the October invoice the last word on the structure.\nText 2\nCores drilled in 2016 show a cold joint a meter under the lantern bolts. The upper lift contains gravel the 1924 supplier did not stock. Clay in the joint holds pollen from plants that reached the harbor only in the 1930s. The cores leave the October invoice as a record of the first pour and show a later lift sitting on that pour.",
    CROSS,
    "The upper lift was placed after the October pour that Text 1 treats as the finished breakwater.",
    [
      "Pollen in the joint shows that the upper lift was already standing when the October invoice was written.",
      "The cold joint confirms that the lantern bolts were fastened to the single pour described in the 1924 report.",
      "Because the upper gravel was outside the 1924 stock, the cores show that the October invoice was never issued.",
    ],
    "Text 1 treats the October invoice as the end of the work. Text 2 finds a later lift, with 1930s pollen, on top of that pour, so the completion date in Text 1 is too early. The pollen does not put the upper lift before the invoice, the cold joint is a second pour, and the cores keep the invoice as a record of the first pour.",
    "Oct 30 cross-text: 1930s pollen and a cold joint show that Text 1 ended the breakwater at a pour that was only the lower lift.",
    CRAFT,
    "Cross-Text Connections",
  ),
  r(
    "Text 1\nGuild minutes say every finished chart was read aloud to a second clerk before the ink was treated as dry. The preface calls that reading part of making a chart and states the rule for every chart the loft releases. Working sheets, stamps, and any stage before release go unmentioned. Silence in the minutes is treated as proof that a finished chart always received the second reading.\nText 2\nWorking sheets from the same loft carry corrections in the first hand and lack a second-reader mark. Those sheets also lack the finished-chart stamp used at release. The study does not redate the finished charts. It finds the second-reading practice stopping short of sheets that stayed on the draft bench, a limit the preface never mentions.",
    CROSS,
    "Working sheets that never received the release stamp show a stage of chartmaking the preface's rule does not cover.",
    [
      "The missing second-reader marks show that finished charts were also released without being read aloud.",
      "The first-hand corrections show that a second clerk read each working sheet aloud before the ink dried.",
      "The absent marks push the start of the second-reading practice into a later decade than the minutes claim.",
    ],
    "Text 1 states the second-reading rule for released charts and never discusses drafts. Text 2's unstamped working sheets are a stage that rule does not cover. The study does not claim finished charts skipped the reading, the missing mark is not evidence the sheets were read aloud, and it does not redate the practice.",
    "Oct 30 cross-text: draft sheets lack a second-reader mark, so the release rule in the preface has a limit the preface itself does not state.",
    CRAFT,
    "Cross-Text Connections",
  ),
  r(
    "Historians of the 1918 port strike proposed that the walkout spread because the dock union published a single leaflet. They expected blocks that received the leaflet on the first morning to join by nightfall, and blocks that received none to stay at work. Pay ledgers from that week show the opposite pattern: several blocks without the leaflet stopped work, while two blocks that received it kept the cranes running. The authors cannot tell whether rumor outran the leaflet or a separate wage cut arrived the same morning, and they leave that mechanism unmarked. They also decline to call the strike citywide, since the ledgers cover only the blocks beside the port.",
    STRUCTURE,
    "It sets a proposed explanation beside evidence that cuts against it and leaves the cause of the mismatch unresolved.",
    [
      "It sets a proposed explanation beside evidence that cuts against it and ends by recommending a new labor statute.",
      "It replaces the leaflet explanation with a settled account based on a wage cut.",
      "It narrates the career of the printer who set the leaflet in type.",
    ],
    "The leaflet hypothesis is followed by ledgers that cut against it, and the authors leave the mechanism unmarked. They do not recommend a statute, they do not settle on the wage cut, and they do not tell a printer's life.",
    "Oct 30 structure: a leaflet hypothesis is cut down by the pay ledgers, and the cause of that mismatch stays open rather than becoming policy or biography.",
    CRAFT,
    "Text Structure and Purpose",
  ),
  r(
    "The opening paragraph describes the parish clock striking an hour the village has already spent in the fields. It lingers on the gap between the bell and the scythes, then follows one farmer who keeps cutting after the sound fades. The sentences stay with that gap: the stroke of the bell, the blades still moving, the row still unfinished.",
    PURPOSE,
    "Depict the gap between the parish hour and field work that continues through it",
    [
      "Explain how the parish clock was repaired",
      "Argue that field work should stop when the bell rings",
      "Report the size of that year's harvest",
    ],
    "The paragraph stays on the bell and the farmer who keeps cutting, so its purpose is to depict that gap. A repair, an argument that the work should stop, and a harvest total are not what the sentences do.",
    "Oct 30 purpose: the paragraph depicts official time beside labor that continues, rather than explaining a repair, judging the farmer, or tallying the harvest.",
    CRAFT,
    "Text Structure and Purpose",
  ),
  r(
    "Early readers of the treaty called the harbor clause hostile in tone. The minutes of the closer reading show that the wording of the fishing right was left intact. What rose was the cost of the inner channel, until the fleet tied up at the outer pier. The clause was ___ the right the treaty had granted.",
    WORD,
    "inimical to",
    ["hostile to", "antithetical to", "indifferent to"],
    "The cost rose until the fleet tied up, so the clause was harmful in effect: inimical to the right. Hostile to stops at the early tone reading, antithetical to would require the wording of the right to have been contradicted, and indifferent to would require the right to have been left untouched in practice.",
    "Oct 30 vocabulary: inimical to names a harmful effect on a right whose wording stayed intact, a shade hostile, antithetical, and indifferent do not share.",
    CRAFT,
    "Words in Context",
  ),
  r(
    "For years a mechanic walked the inlet at dusk to catch a pressure drop in the old line. The valve installed in June opens as soon as that drop begins. The path stays open, and the key to the gate remains on the same hook, but the dusk log, which had run without a gap for years, closes that week. The valve was added to ___ the inspection.",
    WORD,
    "obviate",
    ["preclude", "forestall", "curtail"],
    "The valve handles the drop the inspection existed to catch, so it makes the inspection unnecessary: it obviates it. Preclude and forestall would mean the walk itself was prevented, yet the path and the key remain, and curtail would mean the walk was only shortened rather than left without a purpose.",
    "Oct 30 vocabulary: obviate fits a valve that removes the need for a dusk inspection, while preclude, forestall, and curtail describe blocking or shortening the walk.",
    CRAFT,
    "Words in Context",
  ),
  r(
    "The style sheet marks some commas as required and others as optional. This editor returned pages for the optional marks even after every required comma was already in place. Colleagues who enforce that required list describe the extra returns as a refusal to accept a page the sheet already allows. Her standard was ___.",
    WORD,
    "fastidious",
    ["meticulous", "scrupulous", "assiduous"],
    "Refusing a page that already meets the sheet, over marks the sheet calls optional, is a fastidious standard. Meticulous names careful precision without that excess, scrupulous names obedience to the required list the colleagues already enforce, and assiduous names persistent effort rather than an overly fine standard.",
    "Oct 30 vocabulary: fastidious fits a refusal to accept optional commas once the required ones are in place, unlike meticulous, scrupulous, or assiduous.",
    CRAFT,
    "Words in Context",
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
