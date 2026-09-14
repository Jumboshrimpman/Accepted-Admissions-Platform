const POSITIVE_CREDIT_ENTRY_TYPES = new Set(["original", "restored", "adjustment_credit"]);
const PURCHASE_ENTRY_TYPES = new Set(["original", "adjustment_credit"]);

export function ledgerHours(value: unknown): number {
  const hours = Number(value);
  return Number.isFinite(hours) ? hours : 0;
}

export function roundCreditHours(value: number): number {
  return Math.round(value * 100) / 100;
}

export function remainingCreditHours(
  entries: Array<{ entryType: string; hours: unknown }>,
): number {
  const remaining = entries.reduce((total, entry) => {
    const amount = ledgerHours(entry.hours);
    return total + (POSITIVE_CREDIT_ENTRY_TYPES.has(entry.entryType) ? amount : -amount);
  }, 0);
  return roundCreditHours(remaining);
}

export function summarizeCreditHours(
  entries: Array<{ entryType: string; hours: unknown }>,
): { purchasedHours: number; usedHours: number; remainingHours: number } {
  const purchasedHours = roundCreditHours(
    entries.reduce((total, entry) => {
      if (!PURCHASE_ENTRY_TYPES.has(entry.entryType)) return total;
      return total + ledgerHours(entry.hours);
    }, 0),
  );
  const remainingHours = remainingCreditHours(entries);
  const usedHours = roundCreditHours(Math.max(0, purchasedHours - remainingHours));
  return { purchasedHours, usedHours, remainingHours };
}
