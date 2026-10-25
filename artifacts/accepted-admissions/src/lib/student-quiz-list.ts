import { studentAssignmentActionLabel } from "./student-attempt-ui.ts";
import {
  DEFAULT_VISIBLE_UPCOMING_COUNT,
  resolveClientDisplayTimezone,
  sessionDateKey,
} from "./session-display.ts";

/** Post-session geometry homework. Stays open after the linked session day. */
export const GEOMETRY_SAT_FOLLOW_UP_TITLE = "Geometry SAT Questions";

/** Official SAT area and volume follow-up. Same open-after-session behavior. */
export const GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE = "Geometry Area and Volume";

/** Xavier SAT Math practice assigned after Michelle's latest session. */
export const SAT_MATH_FOLLOW_UP_TITLE = "SAT Math Problems";

/** Xavier factoring practice assigned after Michelle's latest session. */
export const FACTORING_QUIZ_FOLLOW_UP_TITLE = "Factoring Quiz";

/** Oct 18 session review. Stays open after the linked session day. */
export const OCT18_SESSION_REVIEW_TITLE = "Oct 18 Session Review Quiz";

/** Unanswered Oct 23 English questions. Stays open after that session day. */
export const OCT23_REMAINING_HOMEWORK_TITLE = "Oct 23 In-Session Practice — Remaining Questions";

const POST_SESSION_FOLLOW_UP_TITLES = new Set<string>([
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
  SAT_MATH_FOLLOW_UP_TITLE,
  FACTORING_QUIZ_FOLLOW_UP_TITLE,
  OCT18_SESSION_REVIEW_TITLE,
  OCT23_REMAINING_HOMEWORK_TITLE,
]);

export function isPostSessionFollowUpQuiz(assignment: {
  title?: string | null;
}): boolean {
  return POST_SESSION_FOLLOW_UP_TITLES.has(assignment.title?.trim() ?? "");
}

/** A follow-up quiz with no meeting is a student to-do, not session prep. */
export function isStandaloneStudentTodo(assignment: {
  sessionId?: string | null;
  title?: string | null;
}): boolean {
  return assignment.sessionId == null && isPostSessionFollowUpQuiz(assignment);
}

type QuizAttempt = {
  id: string;
  title: string;
  subject: string;
  sessionId?: string | null;
  deliveryPhase?: string | null;
  questionCount?: number | null;
  latestAttemptStatus?: string | null;
  latestScore?: number | null;
  deadline?: string | Date | null;
  studentResolvedAt?: string | Date | null;
};

export type QuizSessionRef = {
  id: string;
  dateTime: string | Date;
  timezone: string;
  preparation?: { id?: string | null } | null;
};

export type ClassifiedStudentQuiz<T> = {
  assignment: T;
  status: string;
  pastSessionDay: boolean;
};

/**
 * True after the session's calendar day has ended.
 * The day is the student's IANA timezone when one is stored, otherwise the
 * session timezone. A quiz stays open for the rest of that local day, including
 * after the meeting end time.
 */
export function sessionCalendarDayIsPast(
  session: Pick<QuizSessionRef, "dateTime" | "timezone">,
  now: Date = new Date(),
  clientTimezone?: string | null,
): boolean {
  const timezone = resolveClientDisplayTimezone(clientTimezone, session.timezone);
  const sessionDay = sessionDateKey({ dateTime: session.dateTime, timezone });
  const today = sessionDateKey({ dateTime: now, timezone });
  if (!sessionDay || !today) return false;
  return sessionDay < today;
}

export function studentQuizAttemptStatus(
  assignment: Pick<QuizAttempt, "latestAttemptStatus" | "latestScore" | "deadline">,
  now: Date = new Date(),
): string {
  if (assignment.latestAttemptStatus === "active" || assignment.latestAttemptStatus === "paused") {
    return "In progress";
  }
  if (assignment.latestAttemptStatus === "submitted" || assignment.latestAttemptStatus === "expired") {
    return assignment.latestScore == null ? "Complete" : `${Math.round(assignment.latestScore)}%`;
  }
  if (assignment.deadline && new Date(assignment.deadline).getTime() < now.getTime()) return "Past due";
  return "Not started";
}

function quizUrgency(status: string): number {
  if (status === "Past due") return 0;
  if (status === "In progress") return 1;
  if (status === "Not started") return 2;
  return 3;
}

export function sessionForStudentQuiz<T extends QuizAttempt>(
  assignment: T,
  sessions: readonly QuizSessionRef[],
): QuizSessionRef | undefined {
  if (assignment.sessionId) {
    const linked = sessions.find((session) => session.id === assignment.sessionId);
    if (linked) return linked;
  }
  return sessions.find((session) => session.preparation?.id === assignment.id);
}

export function classifyStudentQuizzes<T extends QuizAttempt>(
  assignments: readonly T[],
  sessions: readonly QuizSessionRef[],
  options?: { now?: Date; clientTimezone?: string | null },
): {
  open: ClassifiedStudentQuiz<T>[];
  archived: ClassifiedStudentQuiz<T>[];
  ordered: ClassifiedStudentQuiz<T>[];
} {
  const now = options?.now ?? new Date();
  const open: ClassifiedStudentQuiz<T>[] = [];
  const archived: ClassifiedStudentQuiz<T>[] = [];
  for (const assignment of assignments) {
    const session = sessionForStudentQuiz(assignment, sessions);
    const followUp = isPostSessionFollowUpQuiz(assignment);
    const pastSessionDay =
      followUp || !session
        ? false
        : sessionCalendarDayIsPast(session, now, options?.clientTimezone);
    const attemptStatus = studentQuizAttemptStatus(assignment, now);
    const status =
      pastSessionDay && attemptStatus !== "Complete" && !attemptStatus.endsWith("%")
        ? "Complete"
        : attemptStatus;
    const classified = { assignment, status, pastSessionDay };
    if (pastSessionDay) archived.push(classified);
    else open.push(classified);
  }
  open.sort((left, right) => {
    const urgency = quizUrgency(left.status) - quizUrgency(right.status);
    if (urgency !== 0) return urgency;
    return left.assignment.title.localeCompare(right.assignment.title);
  });
  archived.sort((left, right) => left.assignment.title.localeCompare(right.assignment.title));
  return { open, archived, ordered: [...open, ...archived] };
}

function isBeforeSessionQuiz(assignment: QuizAttempt): boolean {
  return (assignment.deliveryPhase ?? "before_session") !== "during_session";
}

/**
 * Upcoming session pre-work stays at the top of the student list.
 * An empty shell is dropped when that session already has a set with questions.
 */
function preferQuestionedUpcomingPrework<T extends QuizAttempt>(
  items: readonly ClassifiedStudentQuiz<T>[],
  sessions: readonly QuizSessionRef[],
): ClassifiedStudentQuiz<T>[] {
  const sessionsWithQuestions = new Set<string>();
  for (const item of items) {
    if (item.pastSessionDay || isPostSessionFollowUpQuiz(item.assignment)) continue;
    if (!isBeforeSessionQuiz(item.assignment)) continue;
    if ((item.assignment.questionCount ?? 0) <= 0) continue;
    const session = sessionForStudentQuiz(item.assignment, sessions);
    if (session) sessionsWithQuestions.add(session.id);
  }
  return items.filter((item) => {
    if ((item.assignment.questionCount ?? 0) > 0) return true;
    if (isPostSessionFollowUpQuiz(item.assignment) || !isBeforeSessionQuiz(item.assignment)) {
      return true;
    }
    const session = sessionForStudentQuiz(item.assignment, sessions);
    if (!session || item.pastSessionDay) return true;
    return !sessionsWithQuestions.has(session.id);
  });
}

function quizInstant(value: string | Date | null | undefined): number | null {
  if (value == null || value === "") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Stored deadline when the quiz has one. Otherwise the linked session start.
 * Follow-up homework with no deadline uses that attached session, so Taito's
 * Oct 23 remaining-questions set is dated by his Oct 23 session.
 * Quizzes with neither are undated.
 */
export function studentQuizIsResolved(
  assignment: { studentResolvedAt?: string | Date | null },
): boolean {
  return quizInstant(assignment.studentResolvedAt) != null;
}

export function studentQuizListDueAt<T extends QuizAttempt>(
  assignment: T,
  sessions: readonly QuizSessionRef[],
): number | null {
  const deadline = quizInstant(assignment.deadline);
  if (deadline != null) return deadline;
  return quizInstant(sessionForStudentQuiz(assignment, sessions)?.dateTime);
}

/** Submitted work, or a past-session quiz the list already marks complete. */
function quizListItemIsCompleted<T extends QuizAttempt>(
  item: ClassifiedStudentQuiz<T>,
): boolean {
  if (item.pastSessionDay) return true;
  const attempt = item.assignment.latestAttemptStatus;
  if (attempt === "submitted" || attempt === "expired") return true;
  return item.status === "Complete" || item.status.endsWith("%");
}

/**
 * Open quizzes first, soonest due first. Overdue open work is the soonest.
 * Undated open quizzes follow dated open ones and still come before completed
 * quizzes. Completed quizzes are newest first. Equal times keep the previous order.
 */
function sortQuizzesForStudentList<T extends QuizAttempt>(
  items: readonly ClassifiedStudentQuiz<T>[],
  sessions: readonly QuizSessionRef[],
): ClassifiedStudentQuiz<T>[] {
  return items
    .map((item, index) => ({
      item,
      index,
      due: studentQuizListDueAt(item.assignment, sessions),
      completed: quizListItemIsCompleted(item),
    }))
    .sort((left, right) => {
      if (left.completed !== right.completed) return left.completed ? 1 : -1;
      if (left.due == null && right.due == null) return left.index - right.index;
      if (left.due == null) return 1;
      if (right.due == null) return -1;
      if (left.due !== right.due) {
        return left.completed ? right.due - left.due : left.due - right.due;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

function isUpcomingSessionPrework<T extends QuizAttempt>(
  item: ClassifiedStudentQuiz<T>,
  sessions: readonly QuizSessionRef[],
): boolean {
  if (item.pastSessionDay || isPostSessionFollowUpQuiz(item.assignment)) return false;
  if (!isBeforeSessionQuiz(item.assignment)) return false;
  if ((item.assignment.questionCount ?? 0) <= 0) return false;
  return Boolean(sessionForStudentQuiz(item.assignment, sessions));
}

export function collapsedStudentQuizzes<T extends QuizAttempt>(
  assignments: readonly T[],
  sessions: readonly QuizSessionRef[],
  options: {
    expanded: boolean;
    now?: Date;
    clientTimezone?: string | null;
    initialCount?: number;
  },
) {
  const classified = classifyStudentQuizzes(assignments, sessions, options);
  const open = preferQuestionedUpcomingPrework(classified.open, sessions);
  const upcoming = open
    .filter((item) => isUpcomingSessionPrework(item, sessions))
    .sort((left, right) => {
      const leftSession = sessionForStudentQuiz(left.assignment, sessions);
      const rightSession = sessionForStudentQuiz(right.assignment, sessions);
      const leftTime = leftSession ? new Date(leftSession.dateTime).getTime() : 0;
      const rightTime = rightSession ? new Date(rightSession.dateTime).getTime() : 0;
      return leftTime - rightTime;
    });
  const upcomingIds = new Set(upcoming.map((item) => item.assignment.id));
  const restOpen = open.filter((item) => !upcomingIds.has(item.assignment.id));
  const ordered = sortQuizzesForStudentList(
    [...upcoming, ...restOpen, ...classified.archived],
    sessions,
  );
  const active = ordered.filter((item) => !studentQuizIsResolved(item.assignment));
  const resolved = ordered.filter((item) => studentQuizIsResolved(item.assignment));
  // Open work fills the top of the list. Resolved quizzes leave it so the next open quiz moves up.
  const initialCount = options.initialCount ?? DEFAULT_VISIBLE_UPCOMING_COUNT;
  const hiddenCount = Math.max(0, active.length - initialCount);
  return {
    ...classified,
    open,
    ordered: active,
    resolved,
    visible: options.expanded ? active : active.slice(0, initialCount),
    hiddenCount,
    canToggle: hiddenCount > 0,
  };
}

export function studentQuizActionLabel(
  quiz: Pick<ClassifiedStudentQuiz<QuizAttempt>, "assignment" | "pastSessionDay">,
  viewer: boolean,
): string {
  if (viewer) return "Review";
  const status = quiz.assignment.latestAttemptStatus;
  if (quiz.pastSessionDay && status !== "submitted" && status !== "expired") return "Review";
  if (isPostSessionFollowUpQuiz(quiz.assignment)) {
    if (status === "submitted" || status === "expired") return "Review answers";
    if (status === "active" || status === "paused") return "Resume";
    return "Start quiz";
  }
  return studentAssignmentActionLabel(status);
}
