import { studentAssignmentActionLabel } from "./student-attempt-ui.ts";
import {
  collapsedItems,
  DEFAULT_VISIBLE_UPCOMING_COUNT,
  resolveClientDisplayTimezone,
  sessionDateKey,
} from "./session-display.ts";

type QuizAttempt = {
  id: string;
  title: string;
  subject: string;
  sessionId?: string | null;
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
    const pastSessionDay = session
      ? sessionCalendarDayIsPast(session, now, options?.clientTimezone)
      : false;
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
  const prominent = Math.min(
    options.initialCount ?? DEFAULT_VISIBLE_UPCOMING_COUNT,
    classified.open.length,
  );
  return {
    ...classified,
    ...collapsedItems(classified.ordered, options.expanded, prominent),
  };
}

export function studentQuizActionLabel(
  quiz: Pick<ClassifiedStudentQuiz<QuizAttempt>, "assignment" | "pastSessionDay">,
  viewer: boolean,
): string {
  if (viewer) return "Review";
  const status = quiz.assignment.latestAttemptStatus;
  if (quiz.pastSessionDay && status !== "submitted" && status !== "expired") return "Review";
  return studentAssignmentActionLabel(status);
}
