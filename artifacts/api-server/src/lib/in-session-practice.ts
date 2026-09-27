import { MAX_IN_SESSION_HOMEWORK_QUESTIONS } from "./session-homework.ts";

/** Published during-session quiz built from homework misses. */
export const IN_SESSION_PRACTICE_TITLE = "In-session practice";

export const IN_SESSION_PRACTICE_INSTRUCTIONS =
  "Work the similar practice items generated from homework misses. Each item matches a skill missed on the pre-work. Review the answer and explanation together.";

export type PracticeHomeworkCandidate = {
  id: string;
  deliveryPhase?: string | null;
  status?: string | null;
};

export type HomeworkMissForPractice = {
  questionId: string;
  skill?: string | null;
};

export type PracticeBankItem = {
  id: string;
  skill: string;
  subject: string;
};

export type PracticeSkillMapping = {
  skill: string;
  missedQuestionIds: string[];
  /** Null when the bank has no original item for this skill; the caller fills it. */
  practiceQuestionId: string | null;
};

export type InSessionPracticePlan = {
  questionIds: string[];
  mapping: PracticeSkillMapping[];
  extraQuestionIds: string[];
};

export function practiceSubjectFamily(subject: string): string {
  const normalized = subject.trim().toLowerCase();
  if (normalized.includes("ielts") || normalized.includes("english")) return "ielts";
  if (normalized.includes("sat") || normalized.includes("math") || normalized.includes("reading")) {
    return "sat";
  }
  return normalized || "all";
}

export function normalizePracticeSkill(skill?: string | null): string {
  const value = skill?.trim() ?? "";
  return value.length > 0 ? value : "General";
}

function skillKey(skill: string): string {
  return normalizePracticeSkill(skill).toLowerCase();
}

/**
 * Homework that should drive the in-session practice quiz.
 * `assignments` must be ordered by createdAt ascending.
 * Archived before-session copies are ignored. The newest live homework that
 * already has a submitted or expired attempt wins; otherwise the newest live
 * before-session homework.
 */
export function selectHomeworkForPracticePrep<T extends PracticeHomeworkCandidate>(
  assignments: readonly T[],
  submittedAssignmentIds: ReadonlySet<string>,
): T | null {
  const live = assignments.filter(
    (item) => item.deliveryPhase === "before_session" && item.status !== "archived",
  );
  const withResults = live.filter((item) => submittedAssignmentIds.has(item.id));
  const pool = withResults.length > 0 ? withResults : live;
  return pool.length > 0 ? pool[pool.length - 1]! : null;
}

function groupMisses(missed: readonly HomeworkMissForPractice[]): Array<{
  skill: string;
  missedQuestionIds: string[];
}> {
  const groups = new Map<string, { skill: string; missedQuestionIds: string[] }>();
  for (const item of missed) {
    if (!item.questionId) continue;
    const skill = normalizePracticeSkill(item.skill);
    const key = skillKey(skill);
    const existing = groups.get(key);
    if (existing) {
      if (!existing.missedQuestionIds.includes(item.questionId)) {
        existing.missedQuestionIds.push(item.questionId);
      }
      continue;
    }
    groups.set(key, { skill, missedQuestionIds: [item.questionId] });
  }
  return [...groups.values()];
}

function takeBankQuestion(
  bank: readonly PracticeBankItem[],
  skill: string,
  sessionSubject: string,
  blocked: Set<string>,
): PracticeBankItem | undefined {
  const family = practiceSubjectFamily(sessionSubject);
  const wanted = skillKey(skill);
  return bank.find(
    (question) =>
      practiceSubjectFamily(question.subject) === family &&
      skillKey(question.skill) === wanted &&
      !blocked.has(question.id),
  );
}

/**
 * Map homework misses to original bank items for the in-session practice quiz.
 *
 * One primary item per missed skill (in first-miss order), then extra bank
 * items for those same skills until the in-session cap. The missed question
 * itself is never reused. Skills with no bank item stay unfilled so the
 * caller can create an original item tagged to that skill.
 */
export function selectPracticeQuestionsFromHomeworkMisses(input: {
  missed: readonly HomeworkMissForPractice[];
  bank: readonly PracticeBankItem[];
  sessionSubject: string;
  usedQuestionIds?: ReadonlySet<string>;
  maxCount?: number;
}): InSessionPracticePlan {
  const maxCount = input.maxCount ?? MAX_IN_SESSION_HOMEWORK_QUESTIONS;
  const groups = groupMisses(input.missed);
  const blocked = new Set(input.usedQuestionIds ?? []);
  for (const group of groups) {
    for (const questionId of group.missedQuestionIds) blocked.add(questionId);
  }

  const reserved = groups.slice(0, Math.max(0, maxCount));
  const mapping: PracticeSkillMapping[] = [];
  for (const group of reserved) {
    const match = takeBankQuestion(input.bank, group.skill, input.sessionSubject, blocked);
    if (match) blocked.add(match.id);
    mapping.push({
      skill: group.skill,
      missedQuestionIds: group.missedQuestionIds,
      practiceQuestionId: match?.id ?? null,
    });
  }

  const extraQuestionIds: string[] = [];
  let room = Math.max(0, maxCount - reserved.length);
  if (room > 0 && groups.length > 0) {
    const byMissCount = [...groups].sort(
      (left, right) => right.missedQuestionIds.length - left.missedQuestionIds.length,
    );
    let added = true;
    while (room > 0 && added) {
      added = false;
      for (const group of byMissCount) {
        if (room <= 0) break;
        const match = takeBankQuestion(input.bank, group.skill, input.sessionSubject, blocked);
        if (!match) continue;
        blocked.add(match.id);
        extraQuestionIds.push(match.id);
        room -= 1;
        added = true;
      }
    }
  }

  const questionIds = [
    ...mapping.flatMap((row) => (row.practiceQuestionId ? [row.practiceQuestionId] : [])),
    ...extraQuestionIds,
  ];
  return { questionIds, mapping, extraQuestionIds };
}

/** Original items used when the bank has no approved question for a missed skill. */
export function deterministicPracticeQuestion(skill: string) {
  const normalized = skill.trim().toLowerCase();
  if (normalized.includes("transition")) {
    return {
      stimulus:
        "The design reduced material waste during production. _____, the team continued testing its durability.",
      prompt: "Which choice completes the text with the most logical transition?",
      choices: [
        { id: "a", label: "A", text: "However" },
        { id: "b", label: "B", text: "For example" },
        { id: "c", label: "C", text: "Similarly" },
        { id: "d", label: "D", text: "In particular" },
      ],
      correctAnswer: "a",
      explanation:
        "The second sentence introduces a related but contrasting concern, so “However” is the logical transition.",
    };
  }
  if (normalized.includes("evidence") || normalized.includes("inference")) {
    return {
      stimulus:
        "A two-week comparison found that seedlings in the shaded plot retained more water than seedlings in the unshaded plot, while both plots received the same amount of rain.",
      prompt: "Which conclusion is best supported by the evidence?",
      choices: [
        { id: "a", label: "A", text: "Shade may help the soil retain moisture." },
        { id: "b", label: "B", text: "Every plant grows best in shade." },
        { id: "c", label: "C", text: "Rain never reaches shaded plots." },
        { id: "d", label: "D", text: "The comparison proves all soil is identical." },
      ],
      correctAnswer: "a",
      explanation:
        "The controlled comparison supports a limited relationship between shade and moisture retention, not an absolute claim.",
    };
  }
  const label = skill.replace(/[^\w\s-]/g, "").trim().slice(0, 80) || "the missed skill";
  return {
    stimulus:
      "The neighborhood library added quiet study rooms and extended its evening hours. Attendance increased during the following month.",
    prompt: `Which choice best states the central idea of a passage about ${label}?`,
    choices: [
      { id: "a", label: "A", text: "The library closed its study rooms." },
      { id: "b", label: "B", text: "Library changes coincided with increased attendance." },
      { id: "c", label: "C", text: "Only librarians attended in the evening." },
      { id: "d", label: "D", text: "The neighborhood stopped using the library." },
    ],
    correctAnswer: "b",
    explanation:
      "The text connects the library's added access and facilities with increased attendance without claiming that the changes caused every visit.",
  };
}

export function samePracticeQuestionSet(
  current: readonly string[],
  next: readonly string[],
): boolean {
  if (current.length !== next.length) return false;
  const left = [...current].sort();
  const right = [...next].sort();
  return left.every((id, index) => id === right[index]);
}
