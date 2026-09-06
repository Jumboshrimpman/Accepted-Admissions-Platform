export type WeaknessMiss = {
  questionId: string;
  bankQuestionId?: string | null;
  skill: string;
  domain?: string | null;
  correct: boolean;
  prompt?: string | null;
};

export type WeaknessGroup = {
  skill: string;
  domain: string;
  missCount: number;
  priority: number;
  questionIds: string[];
  bankQuestionIds: string[];
};

/**
 * Group misses by underlying skill. Priority is miss count, then first appearance.
 * Does not dump every miss as its own lesson item.
 */
export function groupMissesByWeakness(items: readonly WeaknessMiss[]): WeaknessGroup[] {
  const buckets = new Map<
    string,
    {
      skill: string;
      domain: string;
      questionIds: string[];
      bankQuestionIds: string[];
    }
  >();
  for (const item of items) {
    if (item.correct) continue;
    const skill = item.skill.trim() || "Unspecified skill";
    const current = buckets.get(skill) ?? {
      skill,
      domain: item.domain?.trim() || "",
      questionIds: [],
      bankQuestionIds: [],
    };
    current.questionIds.push(item.questionId);
    if (item.bankQuestionId) current.bankQuestionIds.push(item.bankQuestionId);
    if (!current.domain && item.domain) current.domain = item.domain;
    buckets.set(skill, current);
  }
  return [...buckets.values()]
    .sort((a, b) => {
      if (b.questionIds.length !== a.questionIds.length) {
        return b.questionIds.length - a.questionIds.length;
      }
      return a.skill.localeCompare(b.skill);
    })
    .map((group, index) => ({
      skill: group.skill,
      domain: group.domain,
      missCount: group.questionIds.length,
      priority: index + 1,
      questionIds: group.questionIds,
      bankQuestionIds: group.bankQuestionIds,
    }));
}
