import { MICHELLE_SOPHIA_LAMAS_CURATED_RW_ITEMS } from "./michelle-sophia-lamas-curated-rw-data.ts";

export type AlignedTableFixture = {
  sourceKey: string;
  bundle: 1 | 2 | 3 | 4;
  phase: string;
  slot: number;
  prompt: string;
  stimulus: string;
  headers: string[];
  rows: string[][];
  choices: Array<{ label: string; text: string }>;
  correctAnswer: string;
  explanation: string;
  domain: string;
  skill: string;
};

export function expectedAlignedTable(stimulus: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  for (const line of stimulus.split("\n")) {
    if (/\t| {2,}/.test(line)) {
      const cells = line.split(/\s{2,}|\t/).map((cell) => cell.trim()).filter(Boolean);
      if (cells.length >= 2) rows.push(cells);
      continue;
    }
    if (rows.length >= 2 && line.trim()) break;
  }
  return { headers: rows[0] ?? [], rows: rows.slice(1) };
}

export function spacedHeaderTabBodyVariant(stimulus: string): string {
  const expected = expectedAlignedTable(stimulus);
  const extractedLines = stimulus.split("\n");
  const firstTable = extractedLines.findIndex((line) => /\t| {2,}/.test(line));
  const lastTable = (() => {
    let end = firstTable;
    for (let index = firstTable; index < extractedLines.length; index += 1) {
      const line = extractedLines[index] ?? "";
      if (/\t| {2,}/.test(line) || !line.trim()) end = index;
      else if (end > firstTable) break;
    }
    return end;
  })();
  const before = extractedLines.slice(0, firstTable).join("\n").trim();
  const after = extractedLines.slice(lastTable + 1).join("\n").trim();
  return [
    before,
    expected.headers.join("    "),
    "",
    ...expected.rows.map((row) => row.join("\t")),
    after,
  ]
    .filter((part, index, parts) => part || (index > 0 && index < parts.length - 1))
    .join("\n");
}

export function michelleLamasAlignedTableFixtures(): AlignedTableFixture[] {
  return MICHELLE_SOPHIA_LAMAS_CURATED_RW_ITEMS.filter(
    (item): item is typeof item & { stimulus: string } =>
      Boolean(item.stimulus && (/\t| {2,}/.test(item.stimulus))),
  ).map((item) => {
    const expected = expectedAlignedTable(item.stimulus);
    return {
      sourceKey: item.sourceKey,
      bundle: item.bundle,
      phase: item.phase,
      slot: item.slot,
      prompt: item.prompt,
      stimulus: item.stimulus,
      headers: expected.headers,
      rows: expected.rows,
      choices: item.choices,
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      domain: item.domain,
      skill: item.skill,
    };
  });
}
