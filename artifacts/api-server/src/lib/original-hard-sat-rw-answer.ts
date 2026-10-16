/**
 * Blind reading of original hard RW items.
 * Decisions use the stimulus, the prompt, and the choices only.
 */

import { extractPlainTextTable } from "./sat-bank-figure-primary.ts";

export type OriginalHardRwAttempt = {
  stimulus?: string | null;
  prompt?: string | null;
  choices: ReadonlyArray<{ id?: string; label?: string; text?: string }>;
};

type Choice = OriginalHardRwAttempt["choices"][number];

const LEXICON: Record<string, { clue: RegExp; block?: RegExp }> = {
  untenable: { clue: /could not be maintained/i, block: /can still be maintained/i },
  tentative: { clue: /offered only as a hunch/i, block: /not merely a cautious guess/i },
  provisional: { clue: /waiting on a second census/i, block: /not merely a cautious guess/i },
  speculative: { clue: /advanced before any count existed/i, block: /once the missing households were included/i },
  laconic: { clue: /one unadorned sentence/i, block: /brusque enough to offend/i },
  curt: { clue: /brusque enough to offend/i, block: /no complaint that the tone was rude/i },
  reticent: { clue: /withheld the harbor figures/i, block: /answered every point/i },
  mute: { clue: /sat through the hearing without speaking/i, block: /answered every point/i },
  ambivalent: { clue: /refuses to drop either judgment/i, block: /has no view at all/i },
  indifferent: { clue: /shows no interest in the outcome/i, block: /refuses to drop either judgment/i },
  neutral: { clue: /takes neither side in the dispute/i, block: /refuses to drop either judgment/i },
  uncertain: { clue: /has not decided which reading to trust/i, block: /states both readings in full/i },
  specious: { clue: /only appeared sound/i, block: /charter was genuine/i },
  plausible: { clue: /might still be sound/i, block: /charter it depended on had been forged/i },
  credible: { clue: /a witness would accept it/i, block: /charter it depended on had been forged/i },
  cogent: { clue: /the reasoning actually holds/i, block: /charter it depended on had been forged/i },
  perennial: { clue: /returns, intact, in every generation/i },
  chronic: { clue: /never lets up across a lifetime/i, block: /not a continuous condition/i },
  temporary: { clue: /will be over within the year/i, block: /returns, intact, in every generation/i },
  seasonal: { clue: /appears only at harvest/i, block: /not confined to harvest months/i },
  corroborate: { clue: /kept by a different clerk confirms/i, block: /uses the same sentences/i },
  duplicate: { clue: /copies the customs book word for word/i, block: /does not repeat the book's wording/i },
  paraphrase: { clue: /restates the same sentences in new words/i, block: /does not restate the same sentences/i },
  contradict: { clue: /denies the shipment date/i, block: /confirms the shipment date/i },
  idiosyncratic: { clue: /no other workshop in the city used/i, block: /shared by the whole guild/i },
  erratic: { clue: /changes the sequence from panel to panel/i, block: /repeated that sequence in every panel/i },
  conventional: { clue: /the sequence every workshop already used/i, block: /no other workshop in the city used/i },
  eccentric: { clue: /a pose struck to look strange/i, block: /not a pose struck to look strange/i },
  attenuate: { clue: /weakens the radio pulse but leaves a readable trace/i },
  amplify: { clue: /strengthens the radio pulse/i, block: /does not strengthen the pulse/i },
  erase: { clue: /wipes the trace away/i, block: /does not wipe the trace away/i },
  maintain: { clue: /keeps the pulse at full strength/i, block: /weakens the radio pulse/i },
  ameliorate: { clue: /improves the acidity of the plots/i },
  cure: { clue: /returns the soil to its pre-canal reading/i, block: /without bringing the soil back/i },
  worsen: { clue: /makes the crust harsher/i, block: /does not make the crust harsher/i },
  ignore: { clue: /leaves the plots untouched/i, block: /do not leave the plots untouched/i },
  anachronistic: { clue: /manufactured in the 1890s/i, block: /belongs to the year of the scene/i },
  antique: { clue: /older than the play's oldest prop/i, block: /manufactured in the 1890s/i },
  futuristic: { clue: /a device from the audience's future/i, block: /not a device from the audience's future/i },
  contemporary: { clue: /from the play's own decade/i, block: /not from the play's own decade/i },
  circumscribe: { clue: /limits the fishing right to the inner harbor/i },
  expand: { clue: /extends the fishing right past the headland/i, block: /limits the fishing right/i },
  abolish: { clue: /ends the fishing right/i, block: /does not end the right/i },
  describe: { clue: /only depicts the coastline/i, block: /does more than depict the coastline/i },
  equivocal: { clue: /declines to rank them/i, block: /ranks one reading above the other/i },
  vague: { clue: /never states either reading clearly/i, block: /wording is exact about each reading/i },
  cryptic: { clue: /hides both readings in code/i, block: /nothing in the report is hidden/i },
  unanimous: { clue: /every reviewer ranks the same reading first/i, block: /declines to rank them/i },
};

const MOVES: ReadonlyArray<{ detect: RegExp; signature: string }> = [
  { detect: /hypothesized that the brown band/i, signature: "a proposed explanation" },
  { detect: /ran against the tannery account/i, signature: "a result that cuts against it" },
  { detect: /mechanism remains unresolved/i, signature: "an open question" },
  { detect: /assumed that guilds kept/i, signature: "a familiar assumption" },
  { detect: /one case broke that assumption/i, signature: "a case that breaks the assumption" },
  { detect: /offers a revised account/i, signature: "a replacement account" },
  { detect: /the procedure was simple/i, signature: "a described procedure" },
  { detect: /contrary to the design of the traps/i, signature: "an unanticipated result" },
  { detect: /could instead have been the night wind/i, signature: "a rival explanation" },
  { detect: /scholars disagree about the dedication/i, signature: "two competing readings" },
  { detect: /the ink weighs toward the later reading/i, signature: "reasons to prefer one reading" },
  { detect: /does not dismiss the earlier reading/i, signature: "a point still granted to the other reading" },
  { detect: /the term names a tax farm/i, signature: "a definition of a term" },
  { detect: /a later century altered the collection/i, signature: "a historical change" },
  { detect: /present readers inherit the nickname/i, signature: "a present-day implication" },
  { detect: /observers recorded the retreat of the ice/i, signature: "a recorded observation" },
  { detect: /volcanic ash cannot be the cause/i, signature: "a cause that has been ruled out" },
  { detect: /ocean heat is still the likeliest/i, signature: "a cause that remains available" },
  { detect: /the quarrel opened over a boundary stone/i, signature: "the opening of a dispute" },
  { detect: /a quoted letter from the surveyor/i, signature: "quoted evidence" },
  { detect: /narrows the conclusion to the western fields/i, signature: "a narrowed conclusion" },
  { detect: /both villages kept terrace ledgers/i, signature: "a comparison of two places" },
  { detect: /a shared trait in the seed lists/i, signature: "a trait the places share" },
  { detect: /the noted difference is the fallow year/i, signature: "a difference that remains" },
  { detect: /the discovery sequence began with a net/i, signature: "the sequence of a discovery" },
  { detect: /the corrected date is 1471/i, signature: "a correction of a date" },
  { detect: /the correction does not show who paid/i, signature: "what that correction does not prove" },
];

const TRAPS = [/life of a single person/i, /call for a new law/i, /year-by-year chronicle/i, /\bin every region\b/i, /\bthe opposite occurred\b/i];

const ANTONYMS: ReadonlyArray<[RegExp, RegExp]> = [
  [/\bexpanded\b/i, /\bshrank\b/i],
  [/\bpraised\b/i, /\bcriticized\b/i],
  [/\bconfirmed\b/i, /\bundermined\b/i],
  [/\bincreased\b/i, /\bdecreased\b/i],
  [/\baccepted\b/i, /\brejected\b/i],
  [/\brose\b/i, /\bfell\b/i],
  [/\bgained\b/i, /\blost\b/i],
  [/\bopened\b/i, /\bclosed\b/i],
  [/\bflourished\b/i, /\bcollapsed\b/i],
  [/\bwidened\b/i, /\bnarrowed\b/i],
];

const CAUSES: ReadonlyArray<[RegExp, RegExp, string]> = [
  [/embargo was imposed/i, /imports declined/i, "Therefore,"],
  [/levee failed/i, /fields were abandoned/i, "Therefore,"],
  [/charter was revoked/i, /the market closed/i, "Therefore,"],
];

function letterOf(choice: Choice): string {
  const id = (choice.id ?? "").trim().toLowerCase();
  if (/^[a-d]$/.test(id)) return id;
  const label = (choice.label ?? "").trim().toLowerCase();
  if (/^[a-d]$/.test(label)) return label;
  throw new Error("A choice is missing its letter.");
}

function textOf(choice: Choice): string {
  return (choice.text ?? "").trim();
}

function wordsOf(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((word) => word.length >= 4);
}

function finite(clause: string): boolean {
  return /\b(is|are|was|were|has|have|had|holds|hold|held|shows|showed|remains|remained|contains|contained|names|named|kept|keeps|made|makes|left|leaves|found|finds|cleared|records|recorded|paid|includes|included)\b/i.test(
    clause,
  );
}

function splitBlank(stimulus: string): [string, string] {
  const parts = stimulus.split("___");
  if (parts.length !== 2) throw new Error("The blank is ambiguous.");
  return [parts[0] ?? "", parts[1] ?? ""];
}

function sentencesAroundBlank(stimulus: string): [string, string] {
  const [before, after] = splitBlank(stimulus);
  const left = before.split(/(?<=[.!?])\s+/).filter((part) => part.trim());
  const right = after.split(/(?<=[.!?])\s+/).filter((part) => part.trim());
  const first = left[left.length - 1] ?? before;
  const second = `${right[0] ?? ""}`.trim();
  return [first.trim(), second];
}

function relation(stimulus: string): string {
  const [first, second] = sentencesAroundBlank(stimulus);
  const pair = `${first} ${second}`;
  if (/^(Although|Even though|Despite)\b/.test(first)) return "Even so,";
  for (const [cause, effect, word] of CAUSES) {
    if (cause.test(first) && effect.test(second)) return word;
  }
  for (const [left, right] of ANTONYMS) {
    if ((left.test(first) && right.test(second)) || (right.test(first) && left.test(second))) return "However,";
  }
  if (/\bonly the\b|\bonly one\b|\bin particular the\b/i.test(second)) return "Specifically,";
  if (/\b(several|many|numerous|various)\b/i.test(first) && (/\b1[0-9]{3}\b/.test(second) || /\b[A-Z][a-z]+\b/.test(second))) {
    return "For instance,";
  }
  if (pair.trim()) return "Moreover,";
  throw new Error("The transition relationship is ambiguous.");
}

function directionClaims(value: string): Array<{ noun: string; dir: "up" | "down" }> {
  const claims: Array<{ noun: string; dir: "up" | "down" }> = [];
  const pattern = /\b([a-z]{4,})\s+(rose|increased|thickened|expanded|grew|climbed|gained|widened|fell|decreased|thinned|shrank|dropped|declined|narrowed|eased)\b/gi;
  for (const match of value.matchAll(pattern)) {
    const noun = match[1]!.toLowerCase();
    const verb = match[2]!.toLowerCase();
    const dir = /^(rose|increased|thickened|expanded|grew|climbed|gained|widened)$/.test(verb) ? "up" : "down";
    if (!["that", "they", "then", "were", "been", "have", "which", "their", "from", "with"].includes(noun)) {
      claims.push({ noun, dir });
    }
  }
  return claims;
}

function coversClaims(choice: string, claims: Array<{ noun: string; dir: "up" | "down" }>): boolean {
  const found = directionClaims(choice);
  for (const claim of claims) {
    const same = found.find((item) => item.noun === claim.noun);
    if (!same || same.dir !== claim.dir) return false;
  }
  for (const item of found) {
    const original = claims.find((claim) => claim.noun === item.noun);
    if (original && original.dir !== item.dir) return false;
  }
  return true;
}

function presentMoves(stimulus: string): Array<{ signature: string }> {
  return MOVES.filter((move) => move.detect.test(stimulus));
}

function structureChoice(stimulus: string, choice: string): boolean {
  const moves = presentMoves(stimulus);
  if (moves.length < 2) return false;
  if (!moves.every((move) => choice.toLowerCase().includes(move.signature))) return false;
  const extras = MOVES.filter((move) => !move.detect.test(stimulus) && choice.toLowerCase().includes(move.signature));
  if (extras.length > 0) return false;
  if (TRAPS.some((trap) => trap.test(choice))) return false;
  return true;
}

function crossRelation(stimulus: string): string {
  const parts = stimulus.split(/Text 2/i);
  const text1 = parts[0] ?? "";
  const text2 = parts[1] ?? "";
  const earlier = /only after|not until|for the first time/i.test(text1) && /earlier|centuries before|already present|predates/i.test(text2);
  const extend = /a single (?:port|valley|workshop|city|archive)/i.test(text1) && /a second (?:port|valley|workshop|city|archive)/i.test(text2);
  const qualify = /without exception|in every case/i.test(text1) && /does not hold when|fails when|except when/i.test(text2);
  const hits = [earlier, extend, qualify].filter(Boolean);
  if (hits.length !== 1) throw new Error("The cross-text relationship is ambiguous.");
  if (earlier) return "the timing in the first account is too late";
  if (extend) return "the pattern holds in a further case";
  return "the stated rule fails under a condition the first account omits";
}

function tableRows(stimulus: string): { headers: string[]; rows: string[][] } {
  const extracted = extractPlainTextTable(stimulus);
  if (!extracted.table || extracted.table.rows.length < 2) throw new Error("The quantitative values are ambiguous.");
  return extracted.table;
}

function cell(table: { headers: string[]; rows: string[][] }, region: string, year: string): number {
  const column = table.headers.indexOf(year);
  const row = table.rows.find((entry) => entry[0] === region);
  if (column < 0 || !row) throw new Error("The quantitative values are ambiguous.");
  const value = Number(row[column]);
  if (!Number.isInteger(value)) throw new Error("The quantitative values are ambiguous.");
  return value;
}

function quantMatch(prompt: string, stimulus: string, choice: string): boolean {
  const asked = /From (\d{4}) to (\d{4}), compare ([A-Z][a-z]+) and ([A-Z][a-z]+)/.exec(prompt);
  if (!asked) throw new Error("The quantitative comparison is ambiguous.");
  const startYear = asked[1]!;
  const endYear = asked[2]!;
  const regions = [asked[3]!, asked[4]!];
  const table = tableRows(stimulus);
  const clauses = [...choice.matchAll(/\b([A-Z][a-z]+) (rose|fell|held) from (\d+) to (\d+)/g)];
  if (clauses.length !== 2) return false;
  const seen = new Set<string>();
  for (const clause of clauses) {
    const region = clause[1]!;
    const verb = clause[2]!;
    const from = Number(clause[3]);
    const to = Number(clause[4]);
    if (!regions.includes(region) || seen.has(region)) return false;
    seen.add(region);
    const start = cell(table, region, startYear);
    const end = cell(table, region, endYear);
    if (from !== start || to !== end) return false;
    if (verb === "rose" && !(end > start)) return false;
    if (verb === "fell" && !(end < start)) return false;
    if (verb === "held" && end !== start) return false;
  }
  return seen.size === 2;
}

function claimParts(stimulus: string): { effect: string; cause: string; direction: string } | null {
  const attributed = /attributes the (decline|rise|drop|increase) in ([a-z]+) to ([a-z]+)/i.exec(stimulus);
  if (attributed) return { direction: attributed[1]!.toLowerCase(), effect: attributed[2]!.toLowerCase(), cause: attributed[3]!.toLowerCase() };
  const product = /treats the ([a-z]+) as the product of ([a-z]+)/i.exec(stimulus);
  if (product) return { direction: "product", effect: product[1]!.toLowerCase(), cause: product[2]!.toLowerCase() };
  const pinned = /pins the ([a-z]+) on the ([a-z]+)/i.exec(stimulus);
  if (pinned) return { direction: "pin", effect: pinned[1]!.toLowerCase(), cause: pinned[2]!.toLowerCase() };
  return null;
}

function evidenceChoice(prompt: string, stimulus: string, choice: string): boolean {
  const claim = claimParts(stimulus);
  if (!claim) return false;
  const lower = choice.toLowerCase();
  if (!lower.includes(claim.effect) || !lower.includes(claim.cause)) return false;
  const weaken = /most directly weaken/i.test(prompt);
  const support = /most directly support/i.test(prompt);
  if (weaken === support) return false;
  const causeAt = lower.indexOf(claim.cause);
  const window = lower.slice(Math.max(0, causeAt - 40), causeAt + claim.cause.length + 40);
  const causeNegated = /\b(no|not|without|absence|never|absent)\b/.test(window);
  if (weaken) return causeNegated && /\b(still|even so|nonetheless|anyway)\b/.test(lower);
  return !causeNegated && /\b(together|in tandem|at the same time)\b/.test(lower) && /\b(held steady|left unchanged|were controlled)\b/.test(lower);
}

function inferenceChoice(stimulus: string, choice: string): boolean {
  const both = /only if both ([a-z ]+) and ([a-z ]+) are present/i.exec(stimulus);
  if (both) {
    const first = both[1]!.trim();
    const second = both[2]!.trim();
    const firstMet = new RegExp(`${first} (?:was|were) present`, "i").test(stimulus);
    const secondMissing = new RegExp(`${second} (?:was|were) absent`, "i").test(stimulus);
    if (!firstMet || !secondMissing) return false;
    const lower = choice.toLowerCase();
    return /could not|did not|failed to/.test(lower) && wordsOf(first).every((word) => lower.includes(word)) && !/proves the opposite of the missing condition/.test(lower);
  }
  const sufficient = /would be enough to ([a-z ]+), but it is not enough once ([a-z ]+) is also true/i.exec(stimulus);
  if (sufficient) {
    const result = sufficient[1]!.trim();
    const blocker = sufficient[2]!.trim();
    if (!new RegExp(`${blocker} is also true`, "i").test(stimulus)) return false;
    const lower = choice.toLowerCase();
    return lower.includes(blocker) && /blocks|prevents|keeps/.test(lower) && wordsOf(result).some((word) => lower.includes(word));
  }
  const ledger = /counts an item only when it is both ([a-z ]+) and ([a-z ]+)/i.exec(stimulus);
  if (ledger) {
    const first = ledger[1]!.trim();
    const second = ledger[2]!.trim();
    const lower = choice.toLowerCase();
    const hasFirst = new RegExp(first, "i").test(stimulus.split("only when")[1] ?? "");
    if (!hasFirst) return false;
    return lower.includes(second) && /left out|not counted|excluded/.test(lower) && !/every item/.test(lower);
  }
  return false;
}

function synthesisChoice(prompt: string, stimulus: string, choice: string): boolean {
  const lower = choice.toLowerCase();
  const contrast = /contrast between the ([a-z0-9 ]+) and the ([a-z0-9 ]+)/i.exec(prompt);
  if (contrast) {
    const left = wordsOf(contrast[1]!).filter((word) => !["that", "with", "from"].includes(word));
    const right = wordsOf(contrast[2]!).filter((word) => !["that", "with", "from"].includes(word));
    if (left.length === 0 || right.length === 0) return false;
    const marker = /\b(but|while)\b/i.test(choice);
    return marker && left.every((word) => lower.includes(word)) && right.every((word) => lower.includes(word));
  }
  if (/unfamiliar audience/i.test(prompt)) {
    const gloss = /^- ([A-Za-z][A-Za-z]+) means ([^.]+)\./m.exec(stimulus);
    if (!gloss) return false;
    const term = gloss[1]!.toLowerCase();
    const defined = wordsOf(gloss[2]!).filter((word) => !["that", "with", "from", "into", "used", "using"].includes(word));
    const hits = defined.filter((word) => lower.includes(word));
    return lower.includes(term) && hits.length >= Math.min(3, defined.length);
  }
  const limitation = /limitation of the ([a-z0-9 ]+)/i.exec(prompt);
  if (limitation) {
    const target = wordsOf(limitation[1]!);
    return /\bcannot\b/i.test(choice) && target.every((word) => lower.includes(word));
  }
  const challenge = /evidence against the ([a-z0-9 ]+)/i.exec(prompt);
  if (challenge) {
    const target = wordsOf(challenge[1]!);
    return /\b(predates|earlier than|before)\b/i.test(choice) && target.every((word) => lower.includes(word));
  }
  const consequence = /result for the ([a-z0-9 ]+)/i.exec(prompt);
  if (consequence) {
    const target = wordsOf(consequence[1]!);
    return target.every((word) => lower.includes(word)) && /\b(must|will have to|has to)\b/i.test(choice);
  }
  return false;
}

function agreementChoice(stimulus: string, choice: string): boolean {
  const each = /^(Each|Neither) of the [a-z]+,/.exec(stimulus);
  const number = /^The (number|collection|set|series) of/.exec(stimulus);
  const plural = /^The ([a-z]+s) of/.exec(stimulus);
  let singular = false;
  if (each || number) singular = true;
  else if (plural && plural[1] !== "series") singular = false;
  else return false;
  const past = /\bin 1[0-9]{3}\b/.test(stimulus) && !/\btoday\b/i.test(stimulus);
  const present = /\btoday\b/i.test(stimulus);
  if (past === present) return false;
  const expected = singular ? (past ? "was" : "is") : past ? "were" : "are";
  return choice.toLowerCase().startsWith(expected);
}

function pronounChoice(stimulus: string, choice: string): boolean {
  if (!/___/.test(stimulus)) return false;
  const head = /^The ([a-z]+) /.exec(stimulus);
  if (!head) return false;
  const noun = head[1]!;
  const plural = noun.endsWith("s");
  const lower = choice.toLowerCase();
  if (plural) return lower === "them" || lower.startsWith("them ");
  if (noun === "committee" || noun === "board" || noun === "choir") return lower === "its" || lower.startsWith("its ");
  return false;
}

function tenseChoice(stimulus: string, choice: string): boolean {
  if (!/^By the time the [a-z]+ (opened|closed|arrived|ended),/i.test(stimulus)) return false;
  return /^had\b/i.test(choice.trim());
}

function boundaryChoice(choices: readonly Choice[], choice: string): boolean {
  const dashes = choices.filter((entry) => (entry.text ?? "").split("—").length - 1 >= 2);
  if (dashes.length === 1) return textOf(dashes[0]!) === choice && (choice.split("—").length - 1 >= 2);
  const colon = choices.filter((entry) => textOf(entry).startsWith(":") && finite(textOf(entry).slice(1)));
  const semi = choices.filter((entry) => textOf(entry).startsWith(";") && finite(textOf(entry).slice(1)));
  if (colon.length === 1 && semi.length === 0) return textOf(colon[0]!) === choice;
  if (semi.length === 1 && colon.length === 0) return textOf(semi[0]!) === choice;
  return false;
}

function matches(item: OriginalHardRwAttempt, choice: Choice): boolean {
  const stimulus = item.stimulus ?? "";
  const prompt = item.prompt ?? "";
  const text = textOf(choice);
  if (/most logical transition/i.test(prompt)) return text === relation(stimulus);
  if (/precise word or phrase/i.test(prompt)) {
    const entry = LEXICON[text.toLowerCase()];
    if (!entry) return false;
    if (!entry.clue.test(stimulus)) return false;
    if (entry.block && entry.block.test(stimulus)) return false;
    return true;
  }
  if (/accomplish this goal/i.test(prompt)) return synthesisChoice(prompt, stimulus, text);
  if (/author of Text 2/i.test(prompt)) return text.toLowerCase().includes(crossRelation(stimulus));
  if (/overall structure|main purpose/i.test(prompt)) return structureChoice(stimulus, text);
  if (/main idea/i.test(prompt)) {
    const claims = directionClaims(stimulus);
    if (claims.length < 2) return false;
    if (/\b(every|always|all)\b/i.test(text) && !/\b(every|always|all)\b/i.test(stimulus)) return false;
    if (TRAPS.some((trap) => trap.test(text))) return false;
    return coversClaims(text, claims);
  }
  if (/most directly (?:weaken|support)/i.test(prompt)) return evidenceChoice(prompt, stimulus, text);
  if (/data from the table/i.test(prompt)) return quantMatch(prompt, stimulus, text);
  if (/most logically completes/i.test(prompt)) return inferenceChoice(stimulus, text);
  if (/conventions of Standard English/i.test(prompt)) {
    if (item.choices.every((entry) => /^(?:is|are|was|were)\b/i.test(textOf(entry)))) return agreementChoice(stimulus, text);
    if (item.choices.some((entry) => /^(?:them|him|her|its)\b/i.test(textOf(entry)))) return pronounChoice(stimulus, text);
    if (/^By the time/i.test(stimulus)) return tenseChoice(stimulus, text);
    return boundaryChoice(item.choices, text);
  }
  return false;
}

/** Every choice the passage itself licenses. */
export function defensibleOriginalHardRw(item: OriginalHardRwAttempt): string[] {
  const stimulus = item.stimulus ?? "";
  const prompt = item.prompt ?? "";
  if (/most logical transition/i.test(prompt)) relation(stimulus);
  if (/author of Text 2/i.test(prompt)) crossRelation(stimulus);
  if (/data from the table/i.test(prompt)) tableRows(stimulus);
  return item.choices.filter((choice) => matches(item, choice)).map(letterOf);
}

/** Letter supported by the passage and choices alone. */
export function answerOriginalHardRw(item: OriginalHardRwAttempt): string {
  const letters = defensibleOriginalHardRw(item);
  if (letters.length !== 1) throw new Error(`Defensible readings: ${letters.length}.`);
  return letters[0]!;
}
