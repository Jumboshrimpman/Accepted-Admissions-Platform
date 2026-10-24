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

const POST_SESSION_FOLLOW_UP_TITLES = new Set<string>([
  GEOMETRY_SAT_FOLLOW_UP_TITLE,
  GEOMETRY_AREA_VOLUME_FOLLOW_UP_TITLE,
  SAT_MATH_FOLLOW_UP_TITLE,
  FACTORING_QUIZ_FOLLOW_UP_TITLE,
  OCT18_SESSION_REVIEW_TITLE,
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
  const ordered = [...upcoming, ...restOpen, ...classified.archived];
  const initialCount = options.initialCount ?? DEFAULT_VISIBLE_UPCOMING_COUNT;
  let otherOpenShown = 0;
  const collapsedVisible: ClassifiedStudentQuiz<T>[] = [...upcoming];
  for (const item of restOpen) {
    const followUp = isPostSessionFollowUpQuiz(item.assignment);
    if (!followUp && otherOpenShown >= initialCount) continue;
    collapsedVisible.push(item);
    if (!followUp) otherOpenShown += 1;
  }
  const hiddenCount = ordered.length - collapsedVisible.length;
  return {
    ...classified,
    open,
    ordered,
    visible: options.expanded ? ordered : collapsedVisible,
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
