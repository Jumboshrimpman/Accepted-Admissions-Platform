export type ScoreableAttemptItem = {
  correct: boolean;
  flagged?: boolean | null;
  reported?: boolean | null;
};

export function isUnscoredAttemptItem(item: ScoreableAttemptItem): boolean {
  return Boolean(item.flagged || item.reported);
}

export function scoreAttemptItems(items: readonly ScoreableAttemptItem[]): {
  correctCount: number;
  totalCount: number;
  score: number;
  unscoredCount: number;
} {
  const scored = items.filter((item) => !isUnscoredAttemptItem(item));
  const correctCount = scored.filter((item) => item.correct).length;
  const totalCount = scored.length;
  return {
    correctCount,
    totalCount,
    score: totalCount === 0 ? 0 : (correctCount / totalCount) * 100,
    unscoredCount: items.length - totalCount,
  };
}
