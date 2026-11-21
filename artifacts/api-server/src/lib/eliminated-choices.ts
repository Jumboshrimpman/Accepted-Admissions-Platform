/** Choice ids a student struck out. Only short letter-like ids are stored. */
export function normalizeEliminatedChoiceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim().toLowerCase();
    if (!/^[a-d]$/.test(id)) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
