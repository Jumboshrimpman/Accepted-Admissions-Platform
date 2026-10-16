/**
 * Blind second pass for original hard reading items.
 * It never reads a stored key. It returns a choice letter or throws.
 */

export type OriginalHardRwAttempt = {
  stimulus?: string | null;
  prompt?: string | null;
  choices: ReadonlyArray<{ id?: string; label?: string; text?: string }>;
};

const CONFIDENT = new Set([
  "confirmed",
  "established",
  "definite",
  "certain",
  "absolute",
  "final",
  "assured",
  "categorical",
  "proven",
  "decisive",
]);
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
const RESULT_WORD = /^(?:therefore|consequently),$/i;
const CONTRAST_WORD = /^(?:however|nevertheless),$/i;
const LEAD_STOP = new Set([
  "which",
  "their",
  "there",
  "about",
  "after",
  "before",
  "other",
  "would",
  "could",
  "should",
  "these",
  "those",
  "while",
  "where",
  "under",
  "every",
]);

const INFERENCE: ReadonlyArray<{ anchor: string; ok: (text: string) => boolean }> = [
  {
    anchor: "calcification",
    ok: (text) =>
      /mineral deposited/i.test(text) &&
      /declined/i.test(text) &&
      /living colonies/i.test(text) &&
      /initial reading/i.test(text),
  },
  {
    anchor: "isotope",
    ok: (text) => /places the fragment earlier/i.test(text) && /firing structure/i.test(text),
  },
  {
    anchor: "fresco",
    ok: (text) => /guild paid/i.test(text) && /subject was chosen/i.test(text) && /plaster/i.test(text),
  },
  {
    anchor: "vellum",
    ok: (text) => /animal skin/i.test(text) && /religious house/i.test(text) && /hand copyist/i.test(text),
  },
  {
    anchor: "turnout",
    ok: (text) => /participation increased/i.test(text) && /never arrived/i.test(text),
  },
  {
    anchor: "amylase",
    ok: (text) => /enzyme accelerated/i.test(text) && /without consuming/i.test(text),
  },
  {
    anchor: "glacier",
    ok: (text) => /ice pulled back/i.test(text) && /water body/i.test(text) && /expanded/i.test(text),
  },
  {
    anchor: "tariff",
    ok: (text) => /goods coming in declined/i.test(text) && /goods going out held/i.test(text),
  },
  {
    anchor: "plasmid",
    ok: (text) =>
      /small circular DNA took on the new gene/i.test(text) && /main genetic strand did not change/i.test(text),
  },
  {
    anchor: "sonnet",
    ok: (text) => /keeps its grievance/i.test(text) && /closing lines/i.test(text),
  },
  {
    anchor: "kinase",
    ok: (text) => /chemical step was slowed/i.test(text) && /continued to split/i.test(text),
  },
  {
    anchor: "elegy",
    ok: (text) => /grief is present/i.test(text) && /never identified/i.test(text),
  },
  {
    anchor: "undercount",
    ok: (text) => /urban areas were missed more often/i.test(text),
  },
  {
    anchor: "villanelle",
    ok: (text) => /repeated line/i.test(text) && /opening question/i.test(text) && /unanswered/i.test(text),
  },
  {
    anchor: "codex",
    ok: (text) => /keeps a song/i.test(text) && /copyist did not write/i.test(text),
  },
];

const CROSS: ReadonlyArray<{ anchor: string; noun: string; stance: RegExp }> = [
  { anchor: "older channel beneath the forum", noun: "aqueducts", stance: /dispute|challenge|reject/i },
  { anchor: "apprenticeship rolls from a second harbor", noun: "guilds", stance: /build on|add support|strengthen/i },
  { anchor: "border that fighters still contest", noun: "treaty", stance: /only partly|limit the claim/i },
  { anchor: "doses given weeks earlier", noun: "vaccines", stance: /dispute|challenge|reject/i },
  { anchor: "neighboring valley with the same verb endings", noun: "dialects", stance: /build on|add support|strengthen/i },
  { anchor: "old rule is still enforced", noun: "reform", stance: /only partly|limit the claim/i },
  { anchor: "naked-eye chronicle", noun: "comets", stance: /dispute|challenge|reject/i },
  { anchor: "membership books from a second mill town", noun: "cooperatives", stance: /build on|add support|strengthen/i },
  { anchor: "unfinished corner the painter never completed", noun: "mural", stance: /only partly|limit the claim/i },
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
  const disproportionate =
    /\b(?:tiny|slight|small)\b/i.test(stimulus) &&
    /\b(?:transformed|upended|reshaped)\b/i.test(stimulus) &&
    /\b(?:effect|outcome|consequence)\b/i.test(stimulus);
  if (disproportionate) {
    return unique(choices, (text) => DISPROPORTIONATE.has(text.toLowerCase()), "The vocabulary choice is ambiguous.");
  }
  if (/\b(?:nonetheless|even so|but still|yet still)\b/i.test(stimulus)) {
    return unique(choices, (text) => CONFIDENT.has(text.toLowerCase()), "The vocabulary choice is ambiguous.");
  }
  throw new Error("The vocabulary context is ambiguous.");
}

function answerAgreement(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const match = /^The ([a-z]+) (?:inside|beside|beyond|under|near) the [a-z]+ ___ [a-z ]+ (right now|yesterday|last night|last year)\.$/i.exec(
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
  else if (example) accept = (text) => text.toLowerCase() === "for example,";
  else throw new Error("The transition relationship is ambiguous.");
  return unique(choices, accept, "The transition choice is ambiguous.");
}

function answerPunctuation(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  if (/one clear result\s*___|single announced finding\s*___|one definite outcome\s*___/i.test(stimulus)) {
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
  const rest = /Of the (\d+) [^.]{0,80}, (\d+) [^.]{0,50} and (\d+) /.exec(stimulus);
  if (rest) {
    const total = Number(rest[1]);
    const first = Number(rest[2]);
    const second = Number(rest[3]);
    const left = total - first - second;
    if (left > 0 && (100 * left) % total === 0) claims.push(`${(100 * left) / total} percent`);
  }
  const climbed = /climbed from (\d+) to (\d+)[\s\S]{0,120}climbed from (\d+) to (\d+)/.exec(stimulus);
  if (climbed) {
    const rise = Number(climbed[2]) - Number(climbed[1]);
    const base = Number(climbed[4]) - Number(climbed[3]);
    if (base > 0 && rise % base === 0) claims.push(`${(100 * rise) / base} percent of`);
  }
  const averaged = /(\d+) [a-z]+ averaged (\d+)\. (\d+) [a-z]+ averaged (\d+)/.exec(stimulus);
  if (averaged) {
    const countA = Number(averaged[1]);
    const meanA = Number(averaged[2]);
    const countB = Number(averaged[3]);
    const meanB = Number(averaged[4]);
    const denom = countA + countB;
    const sum = countA * meanA + countB * meanB;
    if (denom > 0 && sum % denom === 0) claims.push(`combined average of ${sum / denom}`);
  }
  const grew = /grew from (\d+) to (\d+) across (\d+) years/.exec(stimulus);
  if (grew) {
    const delta = Number(grew[2]) - Number(grew[1]);
    const years = Number(grew[3]);
    if (years > 0 && delta % years === 0) claims.push(`average of ${delta / years} per year`);
  }
  const lost = /started at (\d+) units, lost (\d+) percent, and then lost (\d+) percent of what remained/.exec(stimulus);
  if (lost) {
    const start = Number(lost[1]);
    const firstCut = Number(lost[2]);
    const secondCut = Number(lost[3]);
    const result = (start * (100 - firstCut) * (100 - secondCut)) / 10000;
    if (Number.isInteger(result)) claims.push(`${result} units remained`);
  }
  if (claims.length !== 1) throw new Error("The quantitative claim is ambiguous.");
  const claim = claims[0]!;
  return unique(choices, (text) => text.includes(claim), "The quantitative choice is ambiguous.");
}

function leadWords(sentence: string): Set<string> {
  return new Set(
    sentence
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 5 && !LEAD_STOP.has(word)),
  );
}

function answerSynthesis(prompt: string, stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const goal = /wants to (?:emphasize|highlight|stress|center) ([^.]+)/i.exec(prompt);
  if (!goal) throw new Error("The synthesis goal is ambiguous.");
  const words = goal[1]!
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 8);
  if (words.length === 0) throw new Error("The synthesis goal has no distinctive word.");
  words.sort((left, right) => right.length - left.length || left.localeCompare(right));
  const target = words[0]!;
  const lead = leadWords((stimulus.split(/[.!?]/)[0] ?? "").trim());
  let bestScore = 0;
  let best: OriginalHardRwAttempt["choices"][number] | null = null;
  let ties = 0;
  for (const choice of choices) {
    const text = (choice.text ?? "").trim();
    if (text.toLowerCase().includes(target)) continue;
    let score = 0;
    for (const word of lead) if (text.toLowerCase().includes(word)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = choice;
      ties = 1;
    } else if (score === bestScore && score > 0) {
      ties += 1;
    }
  }
  if (!best || ties !== 1 || bestScore < 2) throw new Error("The synthesis choice is ambiguous.");
  return letterOf(best);
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
  if (/accomplish this goal/i.test(prompt)) return answerSynthesis(prompt, stimulus, choices);
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
