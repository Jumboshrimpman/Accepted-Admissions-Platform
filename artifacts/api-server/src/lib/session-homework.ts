import {
  isFullLengthDiagnosticAssignment,
  pickDiagnosticKeeper,
} from "./assignment-visibility.ts";
import { isPostSessionFollowUpTitle } from "./post-session-follow-up.ts";
import {
  inferSessionPreworkKind,
  sessionPreworkDedupeSlot,
  sessionPreworkSubjectFamily,
} from "./session-prework-dedupe.ts";

export const IN_SESSION_HOMEWORK_COMPLETION_TITLE = "In-session homework completion";
export const MAX_IN_SESSION_HOMEWORK_QUESTIONS = 15;

export type SessionHomeworkCandidate = {
  id?: string | null;
  assignmentId?: string | null;
  deliveryPhase?: string | null;
  status?: string | null;
  title?: string | null;
  questionCount?: number | null;
  /** `session_prework_plans.assignmentId` for this row's session. */
  planAssignmentId?: string | null;
};

/** Session homework status lists: one row per assignment, no archived leftovers. */
export type StatusHomeworkCandidate = {
  id?: string;
  assignmentId?: string;
  title?: string | null;
  status?: string | null;
  subject?: string | null;
  homeworkKind?: string | null;
  questionCount?: number | null;
  attemptCount?: number | null;
  deliveryPhase?: string | null;
  createdAt?: Date | string | number | null;
  /**
   * `session_prework_plans.assignmentId` for this row's session.
   * Used to prefer the plan's bank copy when two bank pre-works tie.
   * A published bank pre-work with questions stays listed even when this is missing
   * or points at topic homework.
   */
  planAssignmentId?: string | null;
};

export function statusHomeworkId(item: StatusHomeworkCandidate): string | null {
  return item.assignmentId ?? item.id ?? null;
}

/** Same-title or same full-length diagnostic copies left by reset/reassign. */
export function isDuplicateSessionPrework(
  keeper: StatusHomeworkCandidate,
  candidate: StatusHomeworkCandidate,
): boolean {
  const keeperId = statusHomeworkId(keeper);
  const candidateId = statusHomeworkId(candidate);
  if (!keeperId || !candidateId || keeperId === candidateId) return false;
  if (candidate.status === "archived") return false;
  if (
    candidate.deliveryPhase === "during_session" ||
    keeper.deliveryPhase === "during_session"
  ) {
    return false;
  }
  const keeperDiagnostic = isFullLengthDiagnosticAssignment({
    title: keeper.title,
    homeworkKind: keeper.homeworkKind,
    questionCount: keeper.questionCount,
  });
  const candidateDiagnostic = isFullLengthDiagnosticAssignment({
    title: candidate.title,
    homeworkKind: candidate.homeworkKind,
    questionCount: candidate.questionCount,
  });
  if (keeperDiagnostic && candidateDiagnostic) return true;
  const keeperTitle = keeper.title?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  const candidateTitle = candidate.title?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  if (Boolean(keeperTitle) && keeperTitle === candidateTitle) return true;
  const keeperSlot = sessionPreworkDedupeSlot(keeper.title);
  const candidateSlot = sessionPreworkDedupeSlot(candidate.title);
  if (
    keeperSlot !== null &&
    keeperSlot === candidateSlot &&
    inferSessionPreworkKind(keeper) === inferSessionPreworkKind(candidate) &&
    sessionPreworkSubjectFamily(keeper) === sessionPreworkSubjectFamily(candidate) &&
    sessionPreworkSubjectFamily(keeper) !== "other"
  ) {
    return true;
  }
  return false;
}

function listedCreatedAtMs(value: StatusHomeworkCandidate["createdAt"]): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** The plan's chosen bank pre-work. Prefer it when same-kind bank copies tie. */
function isPlanChosenBankPrework(item: StatusHomeworkCandidate): boolean {
  const id = statusHomeworkId(item);
  if (!id || !item.planAssignmentId || id !== item.planAssignmentId) return false;
  return sessionPreworkDedupeSlot(item.title) === "sat-bank-prework";
}

/** Published bank pre-work that actually has questions. Empty copies are not protected. */
function publishedBankPreworkWithQuestions(item: StatusHomeworkCandidate): boolean {
  if (item.status === "archived") return false;
  if ((item.questionCount ?? 0) <= 0) return false;
  return sessionPreworkDedupeSlot(item.title) === "sat-bank-prework";
}

/**
 * List collapse. Same-slot copies still collapse, including duplicate bank
 * pre-work and empty bank copies. A published bank pre-work that has questions
 * does not collapse into seeded topic homework, whether or not the session plan
 * points at it.
 */
function collapsesWithListedHomework(
  keeper: StatusHomeworkCandidate,
  candidate: StatusHomeworkCandidate,
): boolean {
  if (isDuplicateSessionPrework(keeper, candidate)) return true;
  if (candidate.status === "archived" || keeper.status === "archived") return false;
  if (
    candidate.deliveryPhase === "during_session" ||
    keeper.deliveryPhase === "during_session"
  ) {
    return false;
  }
  if (
    publishedBankPreworkWithQuestions(keeper) ||
    publishedBankPreworkWithQuestions(candidate)
  ) {
    return false;
  }
  const keeperSlot = sessionPreworkDedupeSlot(keeper.title);
  const candidateSlot = sessionPreworkDedupeSlot(candidate.title);
  if (keeperSlot === null || candidateSlot === null || keeperSlot === candidateSlot) {
    return false;
  }
  return (
    inferSessionPreworkKind(keeper) === inferSessionPreworkKind(candidate) &&
    sessionPreworkSubjectFamily(keeper) === sessionPreworkSubjectFamily(candidate) &&
    sessionPreworkSubjectFamily(keeper) !== "other"
  );
}

/**
 * Has questions, then attempts, then createdAt, then id.
 * createdAt replaces the largest-id tie-break. An untouched newer copy does
 * not outrank homework the student already started.
 */
function pickListedStatusKeeper<T extends StatusHomeworkCandidate>(current: T, incoming: T): T {
  const currentQuestions = (current.questionCount ?? 0) > 0 ? 1 : 0;
  const incomingQuestions = (incoming.questionCount ?? 0) > 0 ? 1 : 0;
  if (incomingQuestions !== currentQuestions) {
    return incomingQuestions > currentQuestions ? incoming : current;
  }
  const attemptDelta = (incoming.attemptCount ?? 0) - (current.attemptCount ?? 0);
  if (attemptDelta !== 0) return attemptDelta > 0 ? incoming : current;
  const currentChosen = isPlanChosenBankPrework(current) ? 1 : 0;
  const incomingChosen = isPlanChosenBankPrework(incoming) ? 1 : 0;
  if (incomingChosen !== currentChosen) return incomingChosen > currentChosen ? incoming : current;
  const createdDelta = listedCreatedAtMs(incoming.createdAt) - listedCreatedAtMs(current.createdAt);
  if (createdDelta !== 0) return createdDelta > 0 ? incoming : current;
  const currentId = statusHomeworkId(current) ?? "";
  const incomingId = statusHomeworkId(incoming) ?? "";
  return incomingId.localeCompare(currentId) > 0 ? incoming : current;
}

/**
 * Student/tutor Homework status & results: hide archived reset leftovers,
 * dedupe by assignment id, and keep one current full-length diagnostic.
 */
export function selectStatusHomework<T extends StatusHomeworkCandidate>(
  items: readonly T[],
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const item of items) {
    const id = statusHomeworkId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (item.status === "archived") continue;
    unique.push(item);
  }
  const diagnostics = unique.filter((item) =>
    isFullLengthDiagnosticAssignment({
      title: item.title,
      homeworkKind: item.homeworkKind,
      questionCount: item.questionCount,
    }),
  );
  const afterDiagnostics = (() => {
    if (diagnostics.length <= 1) return unique;
    const keeper = pickDiagnosticKeeper(
      diagnostics.map((item) => ({
        id: statusHomeworkId(item)!,
        status: item.status ?? "published",
        questionCount: item.questionCount ?? 0,
        attemptCount: item.attemptCount ?? 0,
      })),
    );
    const keeperId = keeper?.id;
    return unique.filter((item) => {
      const isDiagnostic = isFullLengthDiagnosticAssignment({
        title: item.title,
        homeworkKind: item.homeworkKind,
        questionCount: item.questionCount,
      });
      return !isDiagnostic || statusHomeworkId(item) === keeperId;
    });
  })();
  const kept: T[] = [];
  for (const item of afterDiagnostics) {
    const duplicateOf = kept.find((keeper) => collapsesWithListedHomework(keeper, item));
    if (!duplicateOf) {
      kept.push(item);
      continue;
    }
    if (pickListedStatusKeeper(duplicateOf, item) !== duplicateOf) {
      const index = kept.indexOf(duplicateOf);
      kept.splice(index, 1, item);
    }
  }
  return kept;
}

/**
 * Publishing topic homework must not retarget `session_prework_plans` onto that
 * row. Bank pre-work and diagnostics still own the plan.
 */
export function planAssignmentIdAfterPreworkPublish(input: {
  publishedId: string;
  publishedTitle: string;
  existingPlanAssignmentId: string | null;
}): { assignmentId: string | null; retarget: boolean } {
  if (sessionPreworkDedupeSlot(input.publishedTitle) === "sat-topic-homework") {
    return { assignmentId: input.existingPlanAssignmentId, retarget: false };
  }
  return { assignmentId: input.publishedId, retarget: true };
}

/**
 * Archiving the plan's assignment may move the plan to another live bank
 * pre-work. It must not move the plan onto topic homework.
 */
export function planAssignmentIdAfterPreworkArchive(input: {
  archivedId: string;
  currentPlanAssignmentId: string | null;
  nextLive: { id: string; title: string } | null;
}): string | null {
  if (!input.currentPlanAssignmentId || input.currentPlanAssignmentId !== input.archivedId) {
    return input.currentPlanAssignmentId;
  }
  if (
    input.nextLive &&
    sessionPreworkDedupeSlot(input.nextLive.title) !== "sat-topic-homework"
  ) {
    return input.nextLive.id;
  }
  return input.currentPlanAssignmentId;
}

/** Boot seed must leave an intentionally archived SAT homework set archived. */
export function shouldRepublishSeededHomework(status: string | null | undefined): boolean {
  return status !== "archived";
}

export type PlaceholderSatHomeworkAction = "attach" | "leave-existing" | "skip-new";

/** A live bank pre-work with questions. Empty or archived copies do not count. */
export function sessionHasBankPrework(
  rows: readonly {
    title?: string | null;
    status?: string | null;
    questionCount?: number | null;
  }[],
): boolean {
  return rows.some(
    (row) =>
      row.status !== "archived" &&
      (row.questionCount ?? 0) > 0 &&
      sessionPreworkDedupeSlot(row.title) === "sat-bank-prework",
  );
}

/**
 * Boot seed must not create another generic SAT Homework set.
 * An existing placeholder stays as-is until an admin archives it by id.
 * `hasBankPrework` is retained so callers can record why a new row was refused.
 */
export function placeholderSatHomeworkAction(input: {
  hasBankPrework: boolean;
  placeholderExists: boolean;
}): PlaceholderSatHomeworkAction {
  void input.hasBankPrework;
  return input.placeholderExists ? "leave-existing" : "skip-new";
}

/** Generic seeded SAT homework, not a bank pre-work set. */
export function isPlaceholderSatHomeworkTitle(title: string | null | undefined): boolean {
  return (title ?? "").trim().startsWith("SAT Homework —");
}

export const PLACEHOLDER_SAT_ARCHIVE_FROM_DATE = "2026-10-30";

export type PlaceholderArchiveCandidate = {
  id: string;
  title?: string | null;
  status?: string | null;
  questionCount?: number | null;
  attemptCount?: number | null;
  sessionDateKey: string;
};

/** Unattempted Taito placeholder rows from Oct 30 onward. Archived rows are omitted. */
export function eligiblePlaceholderArchiveIds(
  rows: readonly PlaceholderArchiveCandidate[],
  fromDate = PLACEHOLDER_SAT_ARCHIVE_FROM_DATE,
  allowedTitles?: ReadonlySet<string>,
): string[] {
  return rows
    .filter(
      (row) =>
        isPlaceholderSatHomeworkTitle(row.title) &&
        (allowedTitles == null || allowedTitles.has((row.title ?? "").trim())) &&
        row.status !== "archived" &&
        (row.attemptCount ?? 0) <= 0 &&
        row.sessionDateKey >= fromDate,
    )
    .map((row) => row.id);
}

/**
 * Apply archives only ids from the dry-run list that are still eligible.
 * Any other id rejects the whole apply so nothing is archived.
 */
export function placeholderArchiveApplyIds(input: {
  candidates: readonly PlaceholderArchiveCandidate[];
  requestedIds: readonly string[];
  allowedTitles?: ReadonlySet<string>;
}): { ok: true; archiveIds: string[] } | { ok: false; rejectedIds: string[] } {
  const eligible = new Set(
    eligiblePlaceholderArchiveIds(input.candidates, PLACEHOLDER_SAT_ARCHIVE_FROM_DATE, input.allowedTitles),
  );
  const rejectedIds = input.requestedIds.filter((id) => !eligible.has(id));
  if (rejectedIds.length > 0) return { ok: false, rejectedIds };
  return { ok: true, archiveIds: [...input.requestedIds] };
}

export type PreworkVisibilityAssignment = {
  id?: string | null;
  title?: string | null;
  status?: string | null;
  deliveryPhase?: string | null;
  questionCount?: number | null;
};

/**
 * Student-facing pre-work is visible and startable when a published
 * before-session set with questions is the active pre-work.
 */
export function preworkStartabilityProblem(
  assignments: readonly PreworkVisibilityAssignment[],
): string | null {
  const published = assignments.filter(
    (item) =>
      item.status === "published" &&
      item.deliveryPhase !== "during_session" &&
      !isPostSessionFollowUpTitle(item.title),
  );
  if (published.length === 0) {
    return "No published before-session pre-work is listed for the student.";
  }
  if (!published.some((item) => (item.questionCount ?? 0) > 0)) {
    return "The listed pre-work has no questions, so it cannot be started.";
  }
  return null;
}

export type FuturePlaceholderSatHomework = {
  dateKey: string;
  placeholderTitle: string;
  placeholderStatus: string;
  questionCount: number;
};

/** Future sessions whose generic SAT Homework row is still attached. Archived rows are omitted. */
export function futurePlaceholderSatHomework(
  sessions: readonly {
    dateKey: string;
    placeholderTitle?: string | null;
    placeholderStatus?: string | null;
    questionCount?: number | null;
  }[],
  today: string,
): FuturePlaceholderSatHomework[] {
  return sessions.flatMap((session) => {
    if (!session.placeholderTitle || session.placeholderStatus === "archived") return [];
    if (session.dateKey <= today) return [];
    return [
      {
        dateKey: session.dateKey,
        placeholderTitle: session.placeholderTitle,
        placeholderStatus: session.placeholderStatus ?? "published",
        questionCount: session.questionCount ?? 0,
      },
    ];
  });
}

export type WrongAnswerCandidate = {
  correct: boolean;
};

export function wrongAnswersOnly<T extends WrongAnswerCandidate>(items: readonly T[]): T[] {
  return items.filter((item) => item.correct === false);
}

export function isInSessionHomeworkCompletion(input: {
  deliveryPhase?: string | null;
  title?: string | null;
}): boolean {
  return (
    input.deliveryPhase === "during_session" &&
    (input.title ?? "").trim() === IN_SESSION_HOMEWORK_COMPLETION_TITLE
  );
}

/** Immediate Check answer is only for live session work, never timed pre-work/diagnostics. */
export function allowsInSessionPerQuestionFeedback(input: {
  deliveryPhase?: string | null;
}): boolean {
  return input.deliveryPhase === "during_session";
}

/** Prefer unanswered homework items, then the rest of the set, never more than 15. */
export function selectInSessionHomeworkQuestionIds(
  sourceQuestionIds: readonly string[],
  options: {
    unansweredIds?: readonly string[];
    alreadyAttachedIds?: readonly string[];
    maxCount?: number;
  } = {},
): string[] {
  const maxCount = options.maxCount ?? MAX_IN_SESSION_HOMEWORK_QUESTIONS;
  const already = new Set(options.alreadyAttachedIds ?? []);
  const remainingSlots = Math.max(0, maxCount - already.size);
  if (remainingSlots === 0) return [];
  const source = sourceQuestionIds.filter((id) => !already.has(id));
  const unansweredSet = new Set(options.unansweredIds ?? []);
  const unanswered = source.filter((id) => unansweredSet.has(id));
  const rest = source.filter((id) => !unansweredSet.has(id));
  return [...unanswered, ...rest].slice(0, remainingSlots);
}

function preworkIdentity(item: SessionHomeworkCandidate): string | null {
  return item.assignmentId ?? item.id ?? null;
}

/**
 * Prefer the live session pre-work copy. Archived replace/remove leftovers must not hide missed items.
 * An empty shell listed ahead of the real set must not win: a plan row with questions wins,
 * otherwise the live before-session copy with the most questions.
 */
export function selectActivePrework<T extends SessionHomeworkCandidate>(
  assignments: readonly T[],
): T | null {
  const live = assignments.filter(
    (item) =>
      item.deliveryPhase === "before_session" &&
      item.status !== "archived" &&
      !isPostSessionFollowUpTitle(item.title),
  );
  if (live.length === 0) return null;
  const questioned = live.filter((item) => (item.questionCount ?? 0) > 0);
  const pool = questioned.length > 0 ? questioned : live;
  const planned = pool.find((item) => {
    const id = preworkIdentity(item);
    return Boolean(
      id &&
        item.planAssignmentId &&
        id === item.planAssignmentId &&
        (item.questionCount ?? 0) > 0,
    );
  });
  if (planned) return planned;
  return [...pool].sort(
    (left, right) => (right.questionCount ?? 0) - (left.questionCount ?? 0),
  )[0] ?? null;
}

/** Show Clear & redo for live homework that has any attempt, including empty/glitched in-session work. */
export function canShowClearHomework(input: {
  deliveryPhase?: string | null;
  assignmentStatus?: string | null;
  attemptId?: string | null;
}): boolean {
  if (input.assignmentStatus === "archived") return false;
  return Boolean(input.attemptId);
}

export function hydrateMistakePrompts<T extends { questionId: string; prompt?: string | null }>(
  mistakes: readonly T[],
  promptsByQuestionId: Map<string, string>,
): Array<T & { prompt: string }> {
  return mistakes.map((item) => ({
    ...item,
    prompt: item.prompt?.trim() || promptsByQuestionId.get(item.questionId) || "",
  }));
}
