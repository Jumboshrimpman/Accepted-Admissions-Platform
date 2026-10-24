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
    "The May ledger was already bound and shelved. The ledger closed in May___a different clerk filed the June tally.",
    STANDARD,
    "; a different clerk filed the June tally.",
    [
      ", a different clerk filed the June tally.",
      ": a different clerk filed the June tally.",
      "a different clerk filed the June tally.",
    ],
    "The June filing is a later independent clause, not an explanation of the May closing and not a renaming of the ledger, so a semicolon joins the two clauses. A comma splices them, a colon would require the filing to explain the closing, and no punctuation at all fuses the two clauses.",
    "Oct 30 boundaries: semicolon versus colon versus comma versus a fused pair, with the same words; only the semicolon fits two independent clauses that do not explain each other.",
    CONV,
    "Boundaries",
  ),
  r(
    "The catalog entry___is the sole surviving record of the second pour.",
    STANDARD,
    "—the clerk dated it May 1924, then revised it after the storm—",
    [
      ", the clerk dated it May 1924, then revised it after the storm,",
      "; the clerk dated it May 1924, then revised it after the storm,",
      ": the clerk dated it May 1924, then revised it after the storm—",
    ],
    "A pair of dashes can set off the clerk's independent clause as a supplement inside the sentence. Commas cannot wrap that clause, a semicolon cannot follow the bare noun phrase 'The catalog entry,' and a colon needs a finished independent clause before it, which that noun phrase is not.",
    "Oct 30 boundaries: dashes set off a medial independent clause, while a comma pair, a semicolon, and a colon-dash mismatch use the same words and fail.",
    CONV,
    "Boundaries",
  ),
  r(
    "Each of the folios that the rival houses have disputed in print since the lawsuit ___ sealed in the vault today.",
    STANDARD,
    "is",
    ["are", "have been", "were"],
    "Each is singular and the vault's state is present, so the verb is is. Are and were agree with the nearer plural nouns, and have been is plural as well.",
    "Oct 30 form: each stays singular across a long plural interrupter, so are, were, and have been all miss the number.",
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
    `${notesIntro}\n- The 1912 map uses a finer scale than the 1910 map.\n- The 1910 map and the 1912 map both mark the stone quay.\n- The 1912 map marks a timber slip east of the quay, and the 1910 map leaves that slip off.\n- Both maps were drawn for the harbor commission.\n- A clerk annotated the 1910 map in pencil in 1914.\n- The archive bought new lamps in April.`,
    goal("The student wants to describe the 1912 map's finer scale together with a waterfront feature that map shows and the 1910 map leaves off."),
    "The 1912 map uses a finer scale than the 1910 map and marks a timber slip east of the quay that the 1910 map leaves off.",
    [
      "The 1910 map and the 1912 map both mark the stone quay, and both maps were drawn for the harbor commission.",
      "The 1912 map uses a finer scale than the 1910 map, and both maps mark the stone quay.",
      "A clerk annotated the 1910 map in pencil in 1914, and the archive bought new lamps in April.",
    ],
    "The goal needs the finer scale and a feature the 1910 map leaves off, which is the timber slip. The shared quay and the shared commission are accurate but do not supply that feature, pairing the scale with the quay still never names the slip, and the pencil note plus the lamps never describe either map's waterfront.",
    "Oct 30 synthesis: six accurate notes, and the goal is met only by joining the finer scale to the timber slip the 1910 map leaves off.",
    EXPR,
    "Rhetorical Synthesis",
  ),
  r(
    `${notesIntro}\n- Most of the watched reef bleached in August.\n- The deep ledge of that reef kept its color through August.\n- Survey boats reached the shallow ledge and did not reach the deep ledge.\n- A donor paid for the survey boat in June.\n- Shallow-ledge water in August matched the temperature in the lab's heat model.\n- The August count of new colonies on the shallow ledge rose.`,
    goal("The student wants to qualify the August bleaching report by pairing it with the part of the reef that kept its color and with the limit on where the boats went."),
    "Most of the watched reef bleached in August, but the deep ledge kept its color, and the survey boats did not reach that ledge.",
    [
      "Most of the watched reef bleached in August, and shallow-ledge water in August matched the temperature in the lab's heat model.",
      "The August count of new colonies on the shallow ledge rose, and a donor paid for the survey boat in June.",
      "The deep ledge kept its color through August, and the survey boats reached the shallow ledge.",
    ],
    "Qualifying the bleaching report takes the August bleaching, the deep ledge that kept its color, and the boats' failure to reach that ledge. The temperature sentence never names the unbleached ledge, the colony count and the donor payment never touch the report, and the color-plus-shallow-ledge sentence leaves out both the bleaching and the limit on the deep ledge.",
    "Oct 30 synthesis: six accurate notes, and the bleaching report is qualified only when the deep ledge's color and the boats' limit are kept with it.",
    EXPR,
    "Rhetorical Synthesis",
  ),
  r(
    "The harbor's 2014 circular walks a clerk through a dock permit in sequence. The clerk stamps the form, the witness signs beneath that stamp, and the permit is entered in the log after the signature. A 2016 margin in the same circular speaks of fee receipts only as papers the clerk may clip behind the folder. The file on the desk carries the harbor stamp. A pencil line says the witness walked back to the street before writing on the signature line. The fee receipt is clipped behind the form. In the log, this file ___.",
    LOGIC,
    "falls short of the circular's condition for entry, because the witness left before signing and the circular places the log entry after that signature",
    [
      "has been entered, because the stamp and the clipped receipt are both with the form",
      "has been entered, because the pencil line places the witness at the dock",
      "cannot be entered, because the harbor stamp is missing from the form",
    ],
    "The circular places the log entry after the witness signs, so this file falls short of that condition: the pencil line says the witness left before writing on the signature line. The 2016 margin treats the receipt as a paper clipped to the folder rather than as the signature. The stamp is already on the form, so the missing-stamp choice contradicts the file.",
    "Oct 30 inference: the log entry sits after the signature in the circular, the witness left before that signature, and the clipped receipt is described as something else.",
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
    "In 1998 the reading room printed a handbook for letters kept in the closed cabinets: clerks were to leave a letter there until the donor had died. In 2004 a slip captioned \"in addition\" was pasted beneath that paragraph, telling clerks to count seventy years from the letter's own date before taking it out. The slip does not cross out the 1998 lines. The letter now on the desk was written in 1986, and its donor died last winter. A clerk has labeled a reading folder and set it on the cart that goes out to the room. The labeled folder ___.",
    LOGIC,
    "does not clear the letter for the reading room, because a letter from 1986 has not finished the seventy-year count the slip adds",
    [
      "clears the letter for the reading room, because the donor's death meets the 1998 instruction",
      "keeps the letter in the cabinet, because the donor is still living",
      "clears the letter for the reading room, because the labeled folder is already on the outgoing cart",
    ],
    "The slip is an addition, and the 1998 lines are not crossed out, so the death instruction and the seventy-year count both remain. The donor has died, but 1986 is forty years before 2026, short of seventy. The folder is not one of the handbook's instructions, and the donor is not living.",
    "Oct 30 inference: an added seventy-year count still applies beside the death instruction, and a letter from 1986 has not reached that count.",
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
    "A harbor commission compared two gauges after a channel dredge that finished in 2016. Harbor gauge readings stand at 16 units in 2013, 37 units in 2016, and 24 units in 2019. Upriver gauge readings stand at 19 units in 2013, 19 units in 2016, and 31 units in 2019. From 2016 to 2019, the harbor reading and the upriver reading ___.",
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
    "When the new sluice gates opened on the lower plots, the harvest books showed grain yields climbing through the dry season. Week by week those same plots, the ones directly beside the gates, put on a thicker salt crust, a white rind the foreman had not recorded in the wet years. A different hand filled the ledger's margin with brick sizes for the ditch lining and with the market days when the gates stayed shut. Upstream plots, which the gates never reached, appear in the book as acres the foreman left unmeasured.",
    IDEA,
    "On the lower plots, grain yields rose and the salt crust thickened.",
    [
      "On the lower plots, grain yields rose and the salt crust thinned.",
      "Grain yields rose on the lower plots.",
      "Grain yields rose and the salt crust thickened on every plot in the valley.",
    ],
    "The harvest books and the rind notes are both about the lower plots: yields climbed, and the crust thickened. Thinning reverses the rind, yields alone drop the crust the second sentence develops, and the valley claim reaches the upstream acres the foreman left unmeasured.",
    "Oct 30 central idea: the lower-plot result pairs a rise in yield with a thicker salt crust, so a reversed rind, a one-sided yield summary, or a valley-wide claim misses it.",
    INFO,
    "Central Ideas and Details",
  ),
  r(
    "At each reception the ambassador's public praise of the host occupied a single formal sentence, and that sentence named the room and the host's courtesy. The entry written later the same night, in a smaller hand, lists what the ambassador had offered that afternoon: a tariff delay, a pilot for the inner channel, and silence about the unpaid wharf fees. A clerk who afterward copied reception pages into the embassy digest carried those sentences of praise into the digest and left the night entries in the diary.",
    "According to the text, what did the ambassador's public praise leave out?",
    "The tariff delay, the channel pilot, and the silence about the wharf fees listed in that night's entry",
    [
      "A longer account of the host's courtesy than the night entry gives",
      "The menus served in the room named in the reception sentence",
      "Nothing, because the night entry repeats the reception sentence and then adds the clerk's digest",
    ],
    "The praise sentence names the room and the courtesy. The night entry lists the tariff delay, the pilot, and the silence about the fees, and the digest copies the praise while leaving that night entry in the diary. The night entry is not a longer account of the courtesy, the menus are not mentioned, and it does not repeat the reception sentence.",
    "Oct 30 detail: the ambassador's public praise names the room and the courtesy, so the afternoon offers recorded that night are what the praise leaves out.",
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
    "The chapter opens as the parish bell strikes an hour the south field has already used. Binders are halfway down the row, and dust has settled on the lane. The narrator stays with one farmer whose scythe keeps its rhythm after the sound fades, then looks back at the tower long enough to see the hammer gone still while the row has not. In the following paragraph the steward's book is quoted, and that quotation gives the same hour as the time when work was to cease. The quotation is set beside the description of the unfinished row, and the chapter moves on with the farmer still cutting.",
    PURPOSE,
    "Place the steward's recorded hour for stopping work beside labor that continues through the bell",
    [
      "Explain how the hammer in the parish tower was repaired",
      "Argue that the farmer should have stopped at the hour written in the steward's book",
      "Report how many sheaves the south row yielded that day",
    ],
    "The chapter sets the book's stopping hour next to the farmer who is still cutting, which is a juxtaposition, not a repair, a command, or a harvest total. The hammer is seen gone still, not taken apart, and no sheaf count appears.",
    "Oct 30 purpose: the steward's hour and the unfinished row are placed side by side, so the chapter is neither a tower repair, a command to stop, nor a yield report.",
    CRAFT,
    "Text Structure and Purpose",
  ),
  r(
    "Early readers of the treaty called the harbor clause sharp in tone. The minutes of the closer reading show that the wording of the fishing right was left intact. What changed was the cost of using the inner channel, which rose until the fleet tied up at the outer pier. The clause was ___ the right the treaty had granted.",
    WORD,
    "inimical to",
    ["brusque toward", "solicitous of", "indifferent to"],
    "The cost rose until the fleet tied up, so the clause was harmful in effect: inimical to the right. Brusque toward names a manner of address, which is the early tone reading, solicitous of would mean the clause looked after the right, and indifferent to would fit only if the right had been left untouched in practice.",
    "Oct 30 vocabulary: inimical to names harm to a right whose wording stayed intact, while brusque toward stays at tone, solicitous of reverses that harm, and indifferent to misses the tied-up fleet.",
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
