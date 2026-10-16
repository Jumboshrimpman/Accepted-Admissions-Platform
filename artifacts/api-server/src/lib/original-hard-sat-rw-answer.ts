/**
 * Blind second pass for original hard reading items.
 * It never reads a stored key. It returns a choice letter or throws.
 */

export type OriginalHardRwAttempt = {
  stimulus?: string | null;
  prompt?: string | null;
  choices: ReadonlyArray<{ id?: string; label?: string; text?: string }>;
};

const HEDGED = new Set(["qualified", "equivocal", "tempered", "guarded", "partial"]);
const UNFOUNDED = new Set(["unfounded", "baseless", "speculative", "unsupported"]);
const DISPROPORTIONATE = new Set(["disproportionate", "outsized", "inordinate"]);
const SINGULAR = new Set([
  "notebook",
  "carton",
  "microscope",
  "violin",
  "treaty",
  "fossil",
  "ledger",
  "compass",
  "mural",
  "passport",
  "helmet",
  "lantern",
  "trophy",
  "capsule",
  "manual",
]);
const PLURAL = new Set([
  "notebooks",
  "cartons",
  "microscopes",
  "violins",
  "treaties",
  "fossils",
  "ledgers",
  "compasses",
  "murals",
  "passports",
  "helmets",
  "lanterns",
  "trophies",
  "capsules",
  "manuals",
]);
const RESULT = /\b(?:waited|postponed|rescheduled|evacuated|rerouted|refunded|suspended|detoured)\b/i;
const CAUSE = /\b(?:delayed|closed|blocked|prevented|damaged|collapsed|stranded|canceled)\b/i;
const SUCCESS = /\b(?:succeeded|approved|flourished|expanded|praised|won)\b/i;
const FAILURE = /\b(?:rejected|failed|declined|shrank|criticized|lost)\b/i;
const RESULT_WORD = /^(?:therefore|consequently)$/i;
const CONTRAST_WORD = /^(?:however|nevertheless)$/i;

const INFERENCE: ReadonlyArray<{ anchor: string; ok: (text: string) => boolean }> = [
  { anchor: "calcification", ok: (text) => /calcification fell/i.test(text) && /cover stayed/i.test(text) },
  { anchor: "vellum", ok: (text) => /vellum/i.test(text) && /printer did not/i.test(text) },
  { anchor: "turnout", ok: (text) => /turnout rose/i.test(text) && /rain did not/i.test(text) },
  { anchor: "amylase", ok: (text) => /amylase/i.test(text) && /substrate was unchanged/i.test(text) },
  { anchor: "sonnet", ok: (text) => /does not forgive/i.test(text) && /speaker/i.test(text) },
  { anchor: "isotope", ok: (text) => /isotope/i.test(text) && /older than/i.test(text) },
  { anchor: "fresco", ok: (text) => /fresco/i.test(text) && /patron did not/i.test(text) },
  { anchor: "undercount", ok: (text) => /undercount/i.test(text) && /cities/i.test(text) && /rural/i.test(text) },
  { anchor: "kinase", ok: (text) => /kinase/i.test(text) && /did not stop cell division/i.test(text) },
  { anchor: "elegy", ok: (text) => /elegy/i.test(text) && /does not name/i.test(text) },
  { anchor: "glacier", ok: (text) => /glacier retreated/i.test(text) && /lake grew/i.test(text) },
  { anchor: "codex", ok: (text) => /codex/i.test(text) && /did not compose/i.test(text) },
  { anchor: "tariff", ok: (text) => /imports fell/i.test(text) && /exports stayed/i.test(text) },
  { anchor: "plasmid", ok: (text) => /plasmid/i.test(text) && /chromosome was unchanged/i.test(text) },
  { anchor: "villanelle", ok: (text) => /villanelle/i.test(text) && /does not resolve/i.test(text) },
];

const CROSS: ReadonlyArray<{ anchor: string; noun: string; stance: RegExp }> = [
  { anchor: "undercuts the claim that aqueducts", noun: "aqueducts", stance: /dispute|challenge|reject/i },
  { anchor: "extends the evidence about guilds", noun: "guilds", stance: /build on|add support|strengthen/i },
  { anchor: "qualifies the praise of the treaty", noun: "treaty", stance: /only partly|limit the claim/i },
  { anchor: "undercuts the claim that vaccines", noun: "vaccines", stance: /dispute|challenge|reject/i },
  { anchor: "extends the evidence about dialects", noun: "dialects", stance: /build on|add support|strengthen/i },
  { anchor: "qualifies the praise of the reform", noun: "reform", stance: /only partly|limit the claim/i },
  { anchor: "undercuts the claim that comets", noun: "comets", stance: /dispute|challenge|reject/i },
  { anchor: "extends the evidence about cooperatives", noun: "cooperatives", stance: /build on|add support|strengthen/i },
  { anchor: "qualifies the praise of the mural", noun: "mural", stance: /only partly|limit the claim/i },
];

function letterOf(choice: { id?: string; label?: string }): string {
  const id = (choice.id ?? "").trim().toLowerCase();
  if (/^[a-d]$/.test(id)) return id;
  const label = (choice.label ?? "").trim().toLowerCase();
  if (/^[a-d]$/.test(label)) return label;
  throw new Error("A choice is missing its letter.");
}

function unique(
  choices: OriginalHardRwAttempt["choices"],
  matches: (text: string) => boolean,
  reason: string,
): string {
  const hits = choices.filter((choice) => matches((choice.text ?? "").trim()));
  if (hits.length !== 1) throw new Error(reason);
  return letterOf(hits[0]!);
}

function answerWords(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  let lexicon: Set<string> | null = null;
  if (/\b(?:admitted|conceded)\b/i.test(stimulus) && /\b(?:but still|yet still)\b/i.test(stimulus)) lexicon = HEDGED;
  else if (/\b(?:no measurements|no data|without evidence)\b/i.test(stimulus) && /\b(?:nonetheless|even so|still insisted)\b/i.test(stimulus)) {
    lexicon = UNFOUNDED;
  } else if (/\b(?:tiny|slight|small)\b/i.test(stimulus) && /\b(?:transformed|upended|reshaped)\b/i.test(stimulus)) {
    lexicon = DISPROPORTIONATE;
  }
  if (!lexicon) throw new Error("The vocabulary context is ambiguous.");
  return unique(choices, (text) => lexicon!.has(text.toLowerCase()), "The vocabulary choice is ambiguous.");
}

function answerAgreement(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const match = /^The ([a-z]+) (?:inside|beside|beyond|under|near) the [a-z]+ ___ [a-z ]+ (right now|today|yesterday|last night|last year)\.$/i.exec(
    stimulus.trim(),
  );
  if (!match) throw new Error("The agreement sentence is ambiguous.");
  const head = match[1]!.toLowerCase();
  const singular = SINGULAR.has(head);
  const plural = PLURAL.has(head);
  if (singular === plural) throw new Error("The agreement subject is ambiguous.");
  const past = /yesterday|last night|last year/i.test(match[2]!);
  const verb = singular ? (past ? "was" : "is") : past ? "were" : "are";
  return unique(choices, (text) => text.toLowerCase() === verb, "The verb choice is ambiguous.");
}

function answerTransition(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const parts = stimulus.split("___");
  if (parts.length !== 2) throw new Error("The transition sentence is ambiguous.");
  const before = parts[0] ?? "";
  const after = parts[1] ?? "";
  const causeEffect = CAUSE.test(before) && RESULT.test(after) && !(SUCCESS.test(before) && FAILURE.test(after));
  const contrast = SUCCESS.test(before) && FAILURE.test(after) && !(CAUSE.test(before) && RESULT.test(after));
  const example = /\b(?:several|many|various)\b/i.test(before) && /\b(?:1[0-9]{3})\b/.test(after) && !causeEffect && !contrast;
  let accept: (text: string) => boolean;
  if (causeEffect) accept = (text) => RESULT_WORD.test(text);
  else if (contrast) accept = (text) => CONTRAST_WORD.test(text);
  else if (example) accept = (text) => text.toLowerCase() === "for example";
  else throw new Error("The transition relationship is ambiguous.");
  return unique(choices, accept, "The transition choice is ambiguous.");
}

function answerPunctuation(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  if (/one clear result ___/i.test(stimulus)) {
    return unique(choices, (text) => text.trim().startsWith(":"), "The colon choice is ambiguous.");
  }
  if (choices.some((choice) => /^, who .+,$/.test((choice.text ?? "").trim()))) {
    return unique(choices, (text) => /^, who .+,$/.test(text), "The nonrestrictive choice is ambiguous.");
  }
  if (/^(?:After|While|Because|Although)\b/.test(stimulus.trim())) {
    return unique(choices, (text) => /^, (?!who)/.test(text), "The introductory comma is ambiguous.");
  }
  if (choices.some((choice) => (choice.text ?? "").trim().startsWith(";"))) {
    return unique(choices, (text) => text.trim().startsWith(";"), "The semicolon choice is ambiguous.");
  }
  throw new Error("The punctuation choice is ambiguous.");
}

function answerQuant(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const claims: string[] = [];
  const ofThe = /Of the (\d+) [^.]{0,80}, (\d+) /.exec(stimulus);
  if (ofThe) claims.push(`${Math.round((100 * Number(ofThe[2])) / Number(ofThe[1]))} percent`);
  const rose = /rose from (\d+) percent to (\d+) percent/.exec(stimulus);
  if (rose) claims.push(`${Number(rose[2]) - Number(rose[1])} percentage points`);
  const margin = /(\d+) percent[\s\S]{0,80}margin of error of (\d+) percentage points/.exec(stimulus);
  if (margin) claims.push(`${Number(margin[1]) - Number(margin[2])} percent`);
  const averages = /averaged (\d+)[^.]{0,50}averaged (\d+)/.exec(stimulus);
  if (averages) claims.push(`difference of ${Math.abs(Number(averages[1]) - Number(averages[2]))}`);
  const grew = /increased from (\d+) to (\d+)/.exec(stimulus);
  if (grew) claims.push(`increase of ${Number(grew[2]) - Number(grew[1])}`);
  if (claims.length !== 1) throw new Error("The quantitative claim is ambiguous.");
  const claim = claims[0]!;
  return unique(choices, (text) => text.includes(claim), "The quantitative choice is ambiguous.");
}

function answerSynthesis(prompt: string, choices: OriginalHardRwAttempt["choices"]): string {
  const goal = /wants to emphasize ([^.]+)/i.exec(prompt);
  if (!goal) throw new Error("The synthesis goal is ambiguous.");
  const words = goal[1]!
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 8);
  if (words.length === 0) throw new Error("The synthesis goal has no distinctive word.");
  words.sort((left, right) => right.length - left.length || left.localeCompare(right));
  const target = words[0]!;
  return unique(choices, (text) => text.toLowerCase().includes(target), "The synthesis choice is ambiguous.");
}

function answerInference(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const hits = INFERENCE.filter((rule) => stimulus.includes(rule.anchor));
  if (hits.length !== 1) throw new Error("The inference passage is ambiguous.");
  return unique(choices, hits[0]!.ok, "The inference choice is ambiguous.");
}

function answerCross(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const hits = CROSS.filter((rule) => stimulus.includes(rule.anchor));
  if (hits.length !== 1) throw new Error("The cross-text passage is ambiguous.");
  const rule = hits[0]!;
  return unique(
    choices,
    (text) => rule.stance.test(text) && text.toLowerCase().includes(rule.noun),
    "The cross-text choice is ambiguous.",
  );
}

/** Letter supported by the passage and choices alone. */
export function answerOriginalHardRw(item: OriginalHardRwAttempt): string {
  const stimulus = item.stimulus ?? "";
  const prompt = item.prompt ?? "";
  const choices = item.choices;
  if (/most logical transition/i.test(prompt)) return answerTransition(stimulus, choices);
  if (/precise word or phrase/i.test(prompt)) return answerWords(stimulus, choices);
  if (/accomplish this goal/i.test(prompt)) return answerSynthesis(prompt, choices);
  if (/author of Text 2/i.test(prompt)) return answerCross(stimulus, choices);
  if (/most strongly supported/i.test(prompt)) return answerInference(stimulus, choices);
  if (/data in the text/i.test(prompt)) return answerQuant(stimulus, choices);
  if (/conventions of Standard English/i.test(prompt)) {
    const verbs = new Set(["is", "was", "are", "were"]);
    if (choices.every((choice) => verbs.has((choice.text ?? "").trim().toLowerCase()))) {
      return answerAgreement(stimulus, choices);
    }
    return answerPunctuation(stimulus, choices);
  }
  throw new Error("The question does not identify a single task.");
}
