const COARSE_SECTION_KEYS = new Set([
  "math",
  "sat math",
  "reading",
  "writing",
  "reading and writing",
  "sat reading and writing",
  "sat reading writing",
  "general",
  "english",
  "rw",
  "r and w",
  "skill not in extract",
  "skill not in pdf",
]);

export function normalizeFocusKey(label: string | null | undefined): string {
  return (label ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isCoarseSectionLabel(label: string | null | undefined): boolean {
  const key = normalizeFocusKey(label);
  return !key || COARSE_SECTION_KEYS.has(key);
}

/** Distinct useful focus — never Math + SAT Math + Reading and Writing. */
export function usefulFocusLabels(labels: readonly string[], limit = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.replace(/\s*\(\d+% accuracy\)\s*$/i, "").trim();
    if (!label || isCoarseSectionLabel(label)) continue;
    const key = normalizeFocusKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}

export function isFillerAnalysis(text: string | null | undefined): boolean {
  return !text?.trim() || /start with the focus areas below/i.test(text);
}

export function queueReasonPreview(reason: string | null | undefined): string | null {
  if (!reason?.trim() || /^New submission alert:/i.test(reason)) return null;
  return reason.trim();
}

export type AlertSectionBreakdown = {
  section?: string;
  label: string;
  accuracy: number;
  missCount: number;
  total?: number;
};

export type AlertMissCluster = {
  label: string;
  missCount: number;
  examples?: string[];
};

export function formatSectionBreakdown(rows: readonly AlertSectionBreakdown[]): string {
  return rows
    .map(
      (row) =>
        `${row.label} ${Math.round(row.accuracy)}% (${row.missCount} miss${row.missCount === 1 ? "" : "es"})`,
    )
    .join(" · ");
}

export function formatMissClusters(clusters: readonly AlertMissCluster[], limit = 3): string {
  return clusters
    .slice(0, limit)
    .map((cluster) => `${cluster.label} ${cluster.missCount}`)
    .join(" · ");
}
