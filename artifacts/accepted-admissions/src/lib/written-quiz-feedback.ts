import { isCoarseSectionLabel } from "./submission-alert-display.ts";

export type WrittenFeedbackItem = {
  correct: boolean;
  skill?: string | null;
  domain?: string | null;
  subject?: string | null;
  prompt?: string | null;
  explanation?: string | null;
  finalAnswer?: string | null;
};

const PLACEHOLDER_EXPLANATION =
  /official explanation (is )?not|do not invent|not in the extract|explanation pending|skill not in (extract|pdf)|college board wording|copyrighted solution/i;

const STUB_EXPLANATION =
  /^(because|contrast|correct|incorrect|wrong|right|see above|explanation|none|null|n\/a|na|tbd|todo|pending|\.+|-+|\?+)\.?$/i;

/** Drop blank stubs and “do not invent” placeholders. Keep a real written explanation. */
export function usableWrittenExplanation(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length < 8) return null;
  if (PLACEHOLDER_EXPLANATION.test(trimmed) || STUB_EXPLANATION.test(trimmed)) return null;
  return trimmed;
}

export function feedbackParagraphs(feedback: string | null | undefined): string[] {
  return (feedback ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function sectionTheme(item: WrittenFeedbackItem): "Math" | "Reading and Writing" | null {
  const haystack = `${item.subject ?? ""} ${item.domain ?? ""} ${item.skill ?? ""}`.toLowerCase();
  if (/math|algebra|geometry|problem-solving|problem solving/.test(haystack)) return "Math";
  if (/reading|writing|english|grammar|evidence|transition|inference|boundary|ielts/.test(haystack)) {
    return "Reading and Writing";
  }
  return null;
}

function themeLabel(item: WrittenFeedbackItem): string {
  const skill = item.skill?.trim() ?? "";
  if (skill && !isCoarseSectionLabel(skill)) return skill;
  const domain = item.domain?.trim() ?? "";
  if (domain && !isCoarseSectionLabel(domain)) return domain;
  return sectionTheme(item) ?? "this set";
}

type PracticeAdvice = { hit: string; miss: string };

function practiceAdvice(theme: string): PracticeAdvice {
  const key = theme.toLowerCase();
  if (key.includes("transition")) {
    return {
      hit: "You matched the link between the ideas. Keep naming the relationship — contrast, cause, example, or sequence — before you choose the word.",
      miss: "Read the ideas on both sides of the blank and name the relationship they actually have: contrast, cause, example, or sequence. The word has to match that relationship. If your choice pointed the other way, say that out loud, then try the next one.",
    };
  }
  if (
    key.includes("boundar") ||
    key.includes("punctuation") ||
    key.includes("grammar") ||
    key.includes("form, structure") ||
    key.includes("form and structure") ||
    key.includes("conventions")
  ) {
    return {
      hit: "The sentence boundary was under control. Keep checking whether the sentence needs a period, a comma, a colon, or no extra mark before you lock the choice.",
      miss: "Treat this as a boundary question. Decide where one complete thought ends and the next begins, then choose the punctuation or linking word that marks that break. Do not pick a mark just because it looks formal.",
    };
  }
  if (key.includes("evidence") || key.includes("textual") || key.includes("quotation")) {
    return {
      hit: "You stayed with the line the question was actually asking about. Keep pointing at the sentence that proves the claim before you commit.",
      miss: "Go back to the passage and underline the sentence that would prove the answer. Your choice has to be supported by that sentence, not by a nearby idea that only sounds related.",
    };
  }
  if (key.includes("inference") || key.includes("implied")) {
    return {
      hit: "You stayed inside what the text supports. Keep asking what the passage actually lets you conclude, and stop before you add a fact it never states.",
      miss: "An inference still has to be licensed by the passage. Say what the text states, then say the smallest conclusion that follows. If your choice added a fact the passage never gives you, that is the miss.",
    };
  }
  if (
    key.includes("words in context") ||
    key.includes("vocabulary") ||
    key.includes("precision") ||
    key.includes("word choice")
  ) {
    return {
      hit: "You picked the word that fit this sentence, not just a familiar synonym. Keep substituting your choice back into the sentence and reading it for tone.",
      miss: "Put each choice back into the sentence and read the whole line. The right word has to match the tone and the claim, not just sit near a dictionary synonym.",
    };
  }
  if (key.includes("linear") || key.includes("equation") || key.includes("algebra") || key.includes("system")) {
    return {
      hit: "The setup matched the relationship in the problem. Keep writing what each quantity stands for before you solve.",
      miss: "Write the relationship in words before you manipulate it: what is unknown, what is given, and what the question wants. Most of these misses come from solving a different equation than the one the problem described.",
    };
  }
  if (
    key.includes("quadratic") ||
    key.includes("nonlinear") ||
    key.includes("function") ||
    key.includes("advanced math") ||
    key.includes("exponential")
  ) {
    return {
      hit: "You kept the structure of the function intact. Keep asking what the question wants — a value, a feature, or an equivalent form — before you rewrite.",
      miss: "Name what the question wants before you rewrite the expression: a value, an intercept, an equivalent form, or a feature of the graph. Then do only the algebra that gets you there.",
    };
  }
  if (key.includes("geometry") || key.includes("triangle") || key.includes("circle") || key.includes("trig")) {
    return {
      hit: "You used the relationship the figure actually gives you. Keep labeling what you know on the diagram before you calculate.",
      miss: "Label the figure with the measures you actually know, and name the relationship you are using (a triangle sum, a circle theorem, similar figures, or a right-triangle ratio). Then calculate from that, not from a formula that does not match the picture.",
    };
  }
  if (
    key.includes("problem-solving") ||
    key.includes("problem solving") ||
    key.includes("data") ||
    key.includes("percent") ||
    key.includes("ratio") ||
    key.includes("statistics")
  ) {
    return {
      hit: "You read the quantity the question asked for. Keep translating the table or graph into that quantity before you compute.",
      miss: "Say the quantity the question wants, in words, and point to the row, bar, or percent that supplies it. Then compute only that. A nearby number from the same display is the usual trap.",
    };
  }
  if (key === "math") {
    return {
      hit: "The Math work held up. Keep writing what the problem is asking before you calculate.",
      miss: "On the Math misses, write what is being asked and what you already know before you calculate. Check that the number you produce is the quantity in the question, not an intermediate step.",
    };
  }
  if (key === "reading and writing") {
    return {
      hit: "Reading and Writing held up. Keep tying each choice back to a line in the text.",
      miss: "On the Reading and Writing misses, point to the line that decides the item and say how the correct choice follows from it. If you cannot point to that line, the choice is a guess.",
    };
  }
  if (key.includes("writing") || key.includes("task response")) {
    return {
      hit: "The response stayed on the task. Keep making one clear comparison or claim and supporting it with the details you were given.",
      miss: "Stay on the task you were given. State the main comparison or claim in one sentence, then support it with details from the prompt. Do not add facts that were not provided.",
    };
  }
  if (key.includes("ielts") || key.includes("true / false") || key.includes("matching heading") || key.includes("reading")) {
    return {
      hit: "You stayed with the passage. Keep finding the sentence that decides the item and paraphrasing it before you choose.",
      miss: "Find the sentence in the passage that decides this item and paraphrase it in your own words. Then check whether your choice matches that paraphrase or quietly changes the claim.",
    };
  }
  return {
    hit: "You chose the answer that fit. When you look back, say in one sentence what made it fit so the same move is available next time.",
    miss: "Compare the choice you marked with the correct one. Say what the question was asking, and what your choice assumed instead. That comparison is the practice.",
  };
}

export type WrittenQuestionNote = {
  source: "explanation" | "coaching";
  text: string;
};

/** Per-question note: the stored explanation when it is real, otherwise skill coaching. */
export function writtenQuestionNote(item: WrittenFeedbackItem): WrittenQuestionNote {
  const explanation = usableWrittenExplanation(item.explanation);
  if (explanation) return { source: "explanation", text: explanation };
  const theme = themeLabel(item);
  const advice = practiceAdvice(theme);
  const named = theme === "this set" ? "" : ` (${theme})`;
  if (!item.finalAnswer?.trim()) {
    return {
      source: "coaching",
      text: `This item was left blank${named}. Commit to a choice next time, even if you are unsure, then compare it with the correct answer and say what the question was asking. A blank does not leave anything to learn from.`,
    };
  }
  if (item.correct) {
    return {
      source: "coaching",
      text:
        theme === "this set"
          ? `You got this one. ${advice.hit}`
          : `You got this ${theme} item. ${advice.hit}`,
    };
  }
  return {
    source: "coaching",
    text:
      theme === "this set"
        ? `This one did not land. ${advice.miss}`
        : `This ${theme} item did not land. ${advice.miss}`,
  };
}
