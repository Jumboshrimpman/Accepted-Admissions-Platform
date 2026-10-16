/**
 * Second pass for original hard reading-and-writing items.
 * This module answers from the stimulus, the prompt, and the choices only.
 */

export type OriginalHardRwAttempt = {
  stimulus?: string | null;
  prompt?: string | null;
  choices: ReadonlyArray<{ id?: string; label?: string; text?: string }>;
};

const POSITIVE = new Set([
  "worthwhile",
  "constructive",
  "coherent",
  "heartening",
  "reassuring",
  "valuable",
  "commendable",
  "promising",
  "durable",
  "lucid",
  "impressive",
  "beneficial",
  "triumphant",
  "favorable",
  "hopeful",
  "fruitful",
]);

const NEGATIVE = new Set([
  "arduous",
  "contentious",
  "chaotic",
  "meager",
  "precarious",
  "flawed",
  "grueling",
  "sparse",
  "costly",
  "disputed",
  "harsh",
  "bleak",
  "dismal",
  "opaque",
  "delayed",
  "taxing",
  "bitter",
  "frayed",
  "grim",
  "thorny",
  "turbulent",
  "scant",
  "uneven",
  "severe",
]);

const SINGULAR_HEADS = new Set([
  "bundle",
  "collection",
  "stack",
  "batch",
  "catalog",
  "library",
  "anthology",
  "portfolio",
  "assortment",
  "inventory",
  "shipment",
  "bouquet",
  "box",
  "folder",
  "packet",
  "album",
  "chest",
  "basket",
  "pile",
  "row",
  "carton",
]);

const STOP = new Set([
  "about",
  "after",
  "again",
  "among",
  "because",
  "before",
  "being",
  "could",
  "during",
  "every",
  "other",
  "should",
  "since",
  "still",
  "their",
  "there",
  "these",
  "those",
  "through",
  "under",
  "until",
  "using",
  "where",
  "which",
  "while",
  "within",
  "without",
  "would",
]);

function letterOf(choice: { id?: string; label?: string }): string {
  const id = (choice.id ?? "").trim().toLowerCase();
  if (/^[a-d]$/.test(id)) return id;
  const label = (choice.label ?? "").trim().toLowerCase();
  if (/^[a-d]$/.test(label)) return label;
  throw new Error("A choice is missing its letter.");
}

function uniqueLetter(
  choices: OriginalHardRwAttempt["choices"],
  matches: (text: string) => boolean,
  reason: string,
): string {
  const hits = choices.filter((choice) => matches((choice.text ?? "").trim()));
  if (hits.length !== 1) throw new Error(reason);
  return letterOf(hits[0]!);
}

function contentWords(text: string): string[] {
  const found: string[] = [];
  for (const raw of text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/)) {
    if (raw.length >= 5 && !STOP.has(raw)) found.push(raw);
  }
  return found;
}

function answerCraft(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const match = /Although the [\w\s]+ was (\w+),/i.exec(stimulus);
  if (!match) throw new Error("The contrast sentence is ambiguous.");
  const adjective = match[1]!.toLowerCase();
  if (!NEGATIVE.has(adjective)) throw new Error("The contrast adjective is ambiguous.");
  return uniqueLetter(
    choices,
    (text) => POSITIVE.has(text.toLowerCase()),
    "The contrast does not point to exactly one word.",
  );
}

function answerInformation(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const source = new Set(contentWords(stimulus));
  return uniqueLetter(
    choices,
    (text) => {
      const words = contentWords(text);
      return words.length >= 2 && words.every((word) => source.has(word));
    },
    "The passage does not support exactly one choice.",
  );
}

function answerConventions(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const match = /^The (\w+) of \w+/i.exec(stimulus.trim());
  if (!match || !stimulus.includes("___")) throw new Error("The grammar sentence is ambiguous.");
  const head = match[1]!.toLowerCase();
  if (!SINGULAR_HEADS.has(head)) throw new Error("The grammar subject is ambiguous.");
  const past = /\b(?:yesterday|last year|last month|in 2019|in 2014|in 2011)\b/i.test(stimulus);
  const verb = past ? "was" : "is";
  return uniqueLetter(choices, (text) => text.toLowerCase() === verb, "The verb choice is ambiguous.");
}

function answerExpression(stimulus: string, choices: OriginalHardRwAttempt["choices"]): string {
  const parts = stimulus.split("___");
  if (parts.length !== 2) throw new Error("The transition sentence is ambiguous.");
  const before = parts[0] ?? "";
  const after = parts[1] ?? "";
  const cause = /\b(?:delayed|frozen|closed)\b/i.test(before);
  const effect = /\b(?:waited|postponed|rescheduled)\b/i.test(after);
  const contrastBefore = /\b(?:approved|succeeded)\b/i.test(before);
  const contrastAfter = /\b(?:declined|rejected|failed)\b/i.test(after);
  let word: string | null = null;
  if (cause && effect && !(contrastBefore && contrastAfter)) word = "therefore";
  else if (contrastBefore && contrastAfter && !(cause && effect)) word = "however";
  if (!word) throw new Error("The transition relationship is ambiguous.");
  return uniqueLetter(choices, (text) => text.toLowerCase() === word, "The transition choice is ambiguous.");
}

/** Letter of the choice that the passage supports. Throws when the item is ambiguous. */
export function answerOriginalHardRw(item: OriginalHardRwAttempt): string {
  const stimulus = item.stimulus ?? "";
  const prompt = item.prompt ?? "";
  if (/conventions of Standard English/i.test(prompt)) return answerConventions(stimulus, item.choices);
  if (/most logical transition/i.test(prompt)) return answerExpression(stimulus, item.choices);
  if (/precise word or phrase/i.test(prompt)) return answerCraft(stimulus, item.choices);
  if (/supported by the text/i.test(prompt)) return answerInformation(stimulus, item.choices);
  throw new Error("The question does not identify a single task.");
}
