const MICHELLE_EMAILS = [
  "makaremmichelle7@gmail.com",
  "michaelmakarem@gmail.com",
] as const;

export function isMichelleClientEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase() ?? "";
  return (MICHELLE_EMAILS as readonly string[]).includes(normalized);
}

export function shouldRepairMichelleQuizMath(input: {
  clientEmail?: string | null;
  clientName?: string | null;
  sessionTitle?: string | null;
  assignmentTitle?: string | null;
}): boolean {
  if (isMichelleClientEmail(input.clientEmail)) return true;
  const hay = [input.clientName, input.sessionTitle, input.assignmentTitle]
    .filter(Boolean)
    .join(" ");
  return /michelle/i.test(hay);
}

export function repairStackedMathNotation(text: string | null | undefined): string {
  if (!text) return "";
  let value = text.replace(/\r\n/g, "\n");

  value = value.replace(/\b([A-Za-z])\n(\d+)\s+(\d+)\n=\n\^\nh/g, "$1 = $2($3)");
  value = value.replace(/\b([A-Za-z])\n(\d+)\s+(\d+)\n(\d+)\n\+\n=\n\^\nh/g, "$1 + $2($3) = $4");
  value = value.replace(/,?\s*([A-Za-z])\s+([A-Za-z])\n\^\nh/g, "($1, $2)");
  value = value.replace(/\b([A-Za-z])\n(\d+)\n(\d+)\n-\n\+\n=\n(?:\^\nh\n?)?/g, "$1 + $2 = -$3");
  value = value.replace(/\b([A-Za-z])\n(\d+)\n(\d+)\n\+\n=-\n?/g, "$1 + $2 = -$3");
  value = value.replace(/\b([A-Za-z])\n(\d+)\n(\d+)\n\+\n=\n?/g, "$1 + $2 = $3");
  value = value.replace(/\b([A-Za-z])\n([A-Za-z])\n(\d+)\n\+\s*=\n?/g, "$1 + $2 = $3");
  value = value.replace(/\b([A-Za-z])\n(\d+)\n(\d+)\n\+\s*\+\n?/g, "$1 + $2 + $3");
  value = value.replace(/\b([A-Za-z])\n([A-Za-z])\n(\d+)\n=\n?/g, "$1 = $3$2");
  value = value.replace(/\b(\d+)\n(\d+)\n-\n?/g, "$1 - $2");
  value = value.replace(/(\d+\s+[A-Za-z]+)\n(\d+\s+[A-Za-z]+)\n=\n?/g, "$1 = $2");
  value = value.replace(/\b(\d+)\s+([A-Za-z]+)\n(\d+)\b/g, "$1/$3 $2");
  value = value.replace(/\b([A-Za-z])\n(\d+)\n(\d+)\b/g, "($3/$2)$1");
  value = value.replace(/\b([A-Za-z])\n(\d+)\n=-\n?/g, "$1 = -$2");
  value = value.replace(/\b([A-Za-z])\n(\d+)\n=\s*/g, "$1 = $2 ");
  value = value.replace(/\b(\d+)\n-\n/g, "-$1 ");

  value = value.replace(/\b([A-Za-z])\s+(\d+)\s+(\d+)\s*-\s*\+\s*=/g, "$1 + $2 = -$3");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s+(\d+)\s*\+\s*=\s*-/g, "$1 + $2 = -$3");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s+(\d+)\s*\+\s*=/g, "$1 + $2 = $3");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s+(\d+)\s*\+\s*\+/g, "$1 + $2 + $3");
  value = value.replace(/\b([A-Za-z])\s+([A-Za-z])\s+(\d+)\s*\+\s*=/g, "$1 + $2 = $3");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s*=\s*-/g, "$1 = -$2");
  value = value.replace(/\b([A-Za-z])\s+(\d+)\s*=/g, "$1 = $2");

  value = value.replace(/\^\s*h\b/g, "");
  return value.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/ +\./g, ".").trim();
}

export function repairMichelleQuizMathText(
  text: string | null | undefined,
  enabled: boolean,
): string {
  const raw = text ?? "";
  return enabled ? repairStackedMathNotation(raw) : raw;
}

export function repairMichelleQuizQuestionFields<
  T extends {
    prompt?: string | null;
    stimulus?: string | null;
    explanation?: string | null;
    choices?: Array<{ text: string }> | null | undefined;
  },
>(item: T, enabled: boolean): T {
  if (!enabled) return item;
  return {
    ...item,
    prompt: item.prompt != null ? repairStackedMathNotation(item.prompt) : item.prompt,
    stimulus: item.stimulus != null ? repairStackedMathNotation(item.stimulus) : item.stimulus,
    explanation:
      item.explanation != null ? repairStackedMathNotation(item.explanation) : item.explanation,
    choices: item.choices?.map((choice) => ({
      ...choice,
      text: repairStackedMathNotation(choice.text),
    })),
  };
}
