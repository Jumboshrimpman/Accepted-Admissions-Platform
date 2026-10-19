const MICHELLE_EMAILS = [
  "makaremmichelle7@gmail.com",
  "michaelmakarem@gmail.com",
] as const;

export function isMichelleClientEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  return (MICHELLE_EMAILS as readonly string[]).includes(normalized);
}

export type QuizMathRepairScope = "off" | "explanation" | "all";

/** Item-specific rewrites run on explanation text. Stems keep the safe stack rules only. */
export type StackedMathField = "explanation" | "stem";

const SHARED_SAT_PREWORK = /SAT pre-work\s*\(30/i;

/**
 * Shared SAT pre-work repairs explanation text only. Michelle's other quizzes
 * may still rebuild smashed equations in the prompt, stimulus, and choices.
 */
export function quizMathRepairScope(input: {
  clientEmail?: string | null;
  clientName?: string | null;
  sessionTitle?: string | null;
  assignmentTitle?: string | null;
}): QuizMathRepairScope {
  if (SHARED_SAT_PREWORK.test(input.assignmentTitle ?? "")) return "explanation";
  if (isMichelleClientEmail(input.clientEmail)) return "all";
  const hay = [input.clientName, input.sessionTitle, input.assignmentTitle]
    .filter(Boolean)
    .join(" ");
  return /michelle/i.test(hay) ? "all" : "off";
}

export function shouldRepairMichelleQuizMath(input: {
  clientEmail?: string | null;
  clientName?: string | null;
  sessionTitle?: string | null;
  assignmentTitle?: string | null;
}): boolean {
  return quizMathRepairScope(input) !== "off";
}

function normalizeQuizMathRepairScope(
  enabled: boolean | QuizMathRepairScope,
): QuizMathRepairScope {
  if (enabled === true) return "all";
  if (enabled === false || enabled === "off") return "off";
  return enabled;
}

/** A number, including extracted thousands groups such as 4,500. */
const EXTRACTED_NUMBER = String.raw`((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)`;

/**
 * College Board explanation PDFs often leave operands on their own lines and
 * park the operators after them. Put those equations back inline, and correct
 * the stacks whose extracted order had changed the math.
 */
function restoreExtractedMathLayout(text: string, field: StackedMathField): string {
  let value = text.replace(/\uF06C/g, "l");
  value = value.replace(/\n+n\s*\n+SAT ANSWER EXPLANATIONS\s+n\s+[A-Z][A-Z0-9 :]+/g, "");
  value = value.replace(/\n+SAT ANSWER EXPLANATIONS\s+n\s+[A-Z][A-Z0-9 :]+/g, "");
  value = value.replace(/\^\s*\n+\s*h\b/g, "^h");
  value = value.replace(/\^\s+h\b/g, "^h");
  value = value.replace(/(?:^|\n)\.\n\$(\d+)\s+(\d{2})\b/g, "\n$$$1.$2");
  value = value.replace(/\$\s*\.\s*\n\s*(\d+)\s+(\d{2})\b/g, "$$$1.$2");
  value = value.replace(/(?:^|\n)\.\s*\n(\d+)\s+(\d{1,2})\b/g, "\n$1.$2");
  value = value.replace(/\(\s*\n\)\s*\n100 300\n75\nx\n=/g, "(x/100)*300 = 75");
  value = value.replace(/\b(\d{1,2}) (\d{3}) (\d{2})\b/g, "$1,$2.$3");
  if (field === "explanation") {
    value = value.replace(/\b(\d{1,3}) (\d{3})\b/g, "$1,$2");
  }

  const rules: Array<[RegExp, string, StackedMathField?]> = [
    [/\bk\nk\n100\n29\b/g, "((29/100)k)/k"],
    [/\bk\n100\n29\b/g, "(29/100)k"],
    [/(?<!k\n)100\n29\b/g, "29/100"],
    [/(\d)\n(\d+)\nx =/g, "$1x = $2"],
    [/,\s*\n(\d+)\s+(\d+)\n\^h/g, "($1, $2)"],
    [/([A-Za-z])\n(4,500)\n(\d+)\n(1,700)\n-\n=/g, "$2 - $3$1 = $4"],
    [/([A-Za-z])\n(\d+)\n(2,800)\n-\n=-/g, "-$2$1 = -$3"],
    [/(4,500)\n(\d+) (\d+)\n-\n\^h/g, "$1 - $2($3)"],
    [/(1,100)\n-\n/g, "-$1\n"],
    [/([A-Za-z])\n([A-Za-z])\n(\d+)\n(\d+)\n106\n\+\s*\+\s*=/g, "$1 + $3$2 + $4 = 106"],
    [/([A-Za-z])\n(\d+)\n(\d+)\n(\d+)\n\+\s*=/g, "$2$1 + $3 = $4"],
    [/([A-Za-z])\n([A-Za-z])\n(\d+)\n(\d+)\n=\n\+/g, "$1 = $3$2 + $4"],
    [/([A-Za-z])\n(\d+)\n(\d+)\n\+(?!\s*[+=])/g, "$2$1 + $3"],
    [/x\n4 20\n6\n=\n\+\n\^h/g, "x = 4(20) + 6"],
    [/([A-Za-z])\n(\d+)\n(\d+)\n=/g, "$2$1 = $3"],
    [/length\n35\nwidth\n10\n=/g, "length/width = 35/10"],
    [/l\n35\n10\nw =/g, "l/w = 35/10"],
    [/0\.08\n\$\s*\.\n\$\n4 23-/g, "$$4.23 - $$0.08"],
    [/0\.08\n\$\s*\.\n\$\n4 23\+/g, "$$4.23 + $$0.08"],
    [/l\n10\n35w\n=/g, "l = 35w/10"],
    [/l\n3\.5w\n=/g, "l = 3.5w"],
    [/l\nx\n\+/g, "l + x"],
    [/7\nw \+/g, "w + 7"],
    [/\(\s*\n\)\s*\nl\n3\.5\n7\nx\nw\n\+\n=\n\+/g, "l + x = 3.5(w + 7)"],
    [/l\n3\.5\n24\.5\nx\nw\n\+\n=\n\+/g, "l + x = 3.5w + 24.5"],
    [/(30,000)\n300\n8\na\n\^k\nh/g, "$1*(8/300)", "explanation"],
    [/\b300\n8\b/g, "8/300", "explanation"],
    [/feet per minute\n(\d+)/g, "$1 feet per minute"],
    [/,\nfeet\n(\d{1,3}(?:,\d{3})+|\d+)/g, "$1 feet"],
    [/b\n43\.2\n196\.8\n2\n2\n2\n\+\n=/g, "b^2 + 43.2^2 = 196.8^2"],
    [/b\n43 2\n196 8\n2\n2\n2\n\+\n=/g, "b^2 + 43.2^2 = 196.8^2"],
    [/b\n(1,866\.24)\n(38,730\.24)\n2\n\+\n=/g, "b^2 + $1 = $2"],
    [/b\n(36,864)\n2=/g, "b^2 = $1"],
    [/x\/88 = 240/g, "x/240 = 88", "explanation"],
    [/x\/240 = 88\s*\^\s*\n?\^h\s*\n?h/g, "x = 21,120", "explanation"],
    [/x\/21 = 120/g, "x = 21,120", "explanation"],
    [/y\n94\n120 =/g, "y/120 = 94", "explanation"],
    [/y\n120 94\n=\s*\^\s*\n?\^h\s*\n?h/g, "y = 11,280", "explanation"],
    [/(21,120)\n(11,280)\n\+/g, "$1 + $2"],
    [/360\n(32,400)/g, "$1/360"],
    [/x x\n7 9\n-\n\^\s*\n?\^h\s*h?/g, "9x(x - 7)"],
    [/x x\n7\n-\n\^h/g, "x(x - 7)"],
    [/V x\nx x\/9 = -7\s*(?:\^\s*){1,3}h\s*h/g, "V(x) = 9x(x - 7)"],
    [/\bx\n7\n-/g, "x - 7"],
    [/x\n0\n>/g, "x > 0"],
    [/%\n(\d{1,3}(?:,\d{3})+|\d+)/g, "$1%", "explanation"],
    [/f\(x\)\nx\/100 = 201\s*\^h/g, "f(x) = (201/100)x"],
    [/f\(x\)\nx\/2 = 01\s*\^h/g, "f(x) = 2.01x"],
    [/f\(x\)\n2 01 x\n=\s*(?:\^\s*){1,3}h\s*h/g, "f(x) = 2.01^x"],
    [/f\(x\)\n1\n-\n\^h/g, "f(x - 1)"],
    [/\.\n2 01\b/g, "2.01"],
    [/x\nx\n684\n,\n100\n(1,800)\n\+\n=\nb\nl/g, "x + ($1/100)x = 684"],
    [/x\nx\n18\n684\n\+\n=/g, "x + 18x = 684"],
    [/x\/19 = 684/g, "19x = 684", "explanation"],
    [/(?:^|\n)(\d+)\n([A-Za-z]) =/g, "\n$2 = $1", "explanation"],
  ];
  for (const [pattern, replacement, onlyField] of rules) {
    if (onlyField && field !== onlyField) continue;
    value = value.replace(pattern, replacement);
  }
  value = value.replace(/(?:^|\n)[ \t]*[.,][ \t]*(?=\n)/g, "\n");
  value = value.replace(/,\s*\n\s*(?=[$\d\-])/g, " ");
  value = value.replace(/\n{3,}/g, "\n\n");
  return value;
}

/**
 * Rebuild College Board extract stacks such as `x\n45\n48\n+\n=` into
 * `x + 45 = 48`. Also accepts the HTML-flattened form `x 45 48 + =`.
 * Leaves ordinary prose alone.
 */
export function repairStackedMathNotation(
  text: string | null | undefined,
  field: StackedMathField = "explanation",
): string {
  if (!text) return "";
  let value = restoreExtractedMathLayout(text.replace(/\r\n/g, "\n"), field);

  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\s+${EXTRACTED_NUMBER}\n=\n\^h`, "g"), "$1 = $2($3)");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\s+${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n\+\n=\n\^h`, "g"), "$1 + $2($3) = $4");
  value = value.replace(/,?\s*([A-Za-z])\s+([A-Za-z])\n\^h/g, "($1, $2)");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n-\n\+\n=\n(?:\^h\n?)?`, "g"), "$1 + $2 = -$3");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n\+\n=-\n?`, "g"), "$1 + $2 = -$3");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n\+\n=\n?`, "g"), "$1 + $2 = $3");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n([A-Za-z])\n${EXTRACTED_NUMBER}\n\+\s*=\n?`, "g"), "$1 + $2 = $3");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n\+\s*\+\n?`, "g"), "$1 + $2 + $3");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n([A-Za-z])\n${EXTRACTED_NUMBER}\n=\n?`, "g"), "$1 = $3$2");
  value = value.replace(new RegExp(String.raw`\b${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n-\n?`, "g"), "$1 - $2");
  value = value.replace(/(\d+\s+[A-Za-z]+)\n(\d+\s+[A-Za-z]+)\n=\n?/g, "$1 = $2");
  value = value.replace(/\b(\d+)\s+(yards|inches|feet|centimeters|meters|minutes)\n(\d+)\b/g, "$1/$3 $2");
  value = value.replace(
    new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n\+\s*\+\s*=`, "g"),
    "$1 + $2 + $3 = $4",
  );
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n\+\s*=`, "g"), "$1 + $2 = $3");
  value = value.replace(new RegExp(String.raw`\b${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\n\+\s*\+`, "g"), "$1 + $2 + $3");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n${EXTRACTED_NUMBER}\b`, "g"), "($3/$2)$1");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n=-\n?`, "g"), "$1 = -$2");
  value = value.replace(new RegExp(String.raw`\b([A-Za-z])\n${EXTRACTED_NUMBER}\n=\s*`, "g"), "$1 = $2 ");
  value = value.replace(new RegExp(String.raw`\b${EXTRACTED_NUMBER}\n-\n(?!=)`, "g"), "-$1 ");

  value = value.replace(/\b([A-Za-z])\s+(\d+)\s+(\d+)\s*-\s*\+\s*=/g, "$1 + $2 = -$3");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s+(\d+)\s*\+\s*=\s*-/g, "$1 + $2 = -$3");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s+(\d+)\s*\+\s*=/g, "$1 + $2 = $3");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s+(\d+)\s*\+\s*\+/g, "$1 + $2 + $3");
  value = value.replace(/\b([A-Za-z])\s+([A-Za-z])\s+(\d+)\s*\+\s*=/g, "$1 + $2 = $3");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s*=\s*-/g, "$1 = -$2");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s*=/g, "$1 = $2");

  value = value.replace(/\^h/g, "");
  value = value.replace(/\^\s*h\b/g, "");
  value = value.replace(/x = 21,120\s*,?\s*or\s+x = 21,120/g, "x = 21,120");
  value = value.replace(/y = 11,280\s*,?\s*or\s+y = 11,280/g, "y = 11,280");
  return value.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/ +\./g, ".").trim();
}

export function repairMichelleQuizMathText(
  text: string | null | undefined,
  enabled: boolean | QuizMathRepairScope,
  field: StackedMathField = "explanation",
): string {
  const raw = text ?? "";
  const scope = normalizeQuizMathRepairScope(enabled);
  if (scope === "off") return raw;
  if (scope === "explanation" && field !== "explanation") return raw;
  return repairStackedMathNotation(raw, field);
}

export function repairMichelleQuizQuestionFields<
  T extends {
    prompt?: string | null;
    stimulus?: string | null;
    explanation?: string | null;
    choices?: Array<{ text: string }> | null | undefined;
  },
>(item: T, enabled: boolean | QuizMathRepairScope): T {
  const scope = normalizeQuizMathRepairScope(enabled);
  if (scope === "off") return item;
  return {
    ...item,
    prompt:
      item.prompt != null ? repairMichelleQuizMathText(item.prompt, scope, "stem") : item.prompt,
    stimulus:
      item.stimulus != null
        ? repairMichelleQuizMathText(item.stimulus, scope, "stem")
        : item.stimulus,
    explanation:
      item.explanation != null
        ? repairMichelleQuizMathText(item.explanation, scope, "explanation")
        : item.explanation,
    choices: item.choices?.map((choice) => ({
      ...choice,
      text: repairMichelleQuizMathText(choice.text, scope, "stem"),
    })),
  };
}
