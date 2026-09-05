export const ASSIGNMENT_ALREADY_ON_SESSION_MESSAGE =
  "This quiz is already assigned to that session. Assigning again would create a duplicate.";
export const ASSIGNMENT_CLONE_COURSE_MISMATCH_MESSAGE =
  "The quiz and session must belong to the same program.";
export const ASSIGNMENT_CLONE_SUBJECT_MISMATCH_MESSAGE =
  "Assignment subject must match the linked session subject";
export const ASSIGNMENT_HAS_ATTEMPTS_REPARENT_MESSAGE =
  "This assignment already has student attempts. Assign it to another session by cloning instead of moving it.";

export type AssignmentQuestionCopy = {
  questionId: string;
  position: number;
  predictionFirst: boolean;
};

export type AssignmentCloneSource = {
  id: string;
  courseId: string;
  sessionId: string | null;
  subjectFamily: string;
  title: string;
  status: string;
  deliveryPhase: string;
};

export type AssignmentCloneTargetSession = {
  id: string;
  courseId: string;
  subjectFamily: string;
};

export type AssignmentCloneExisting = {
  id: string;
  title: string;
  status: string;
  deliveryPhase: string;
};

export type AssignmentCloneEvaluation =
  | {
      ok: true;
      sourceAssignmentId: string;
      targetSessionId: string;
      copiedQuestions: AssignmentQuestionCopy[];
      mutations: {
        updateSource: false;
        updateAttempts: false;
        insertAssignment: true;
        insertQuestions: true;
      };
    }
  | { ok: false; status: 400 | 404 | 409; error: string };

export function normalizeAssignmentTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function assignmentAlreadyOnSession(
  source: Pick<AssignmentCloneSource, "id" | "title" | "deliveryPhase">,
  existingOnTarget: AssignmentCloneExisting[],
): boolean {
  const title = normalizeAssignmentTitle(source.title);
  return existingOnTarget.some(
    (item) =>
      item.status !== "archived" &&
      item.deliveryPhase === source.deliveryPhase &&
      (item.id === source.id || normalizeAssignmentTitle(item.title) === title),
  );
}

export function evaluateAssignmentClone(input: {
  source: AssignmentCloneSource;
  targetSession: AssignmentCloneTargetSession;
  sourceQuestions: AssignmentQuestionCopy[];
  existingOnTarget: AssignmentCloneExisting[];
  allowDuplicate?: boolean;
}): AssignmentCloneEvaluation {
  if (input.source.status === "archived") {
    return { ok: false, status: 404, error: "Assignment not found" };
  }
  if (input.source.courseId !== input.targetSession.courseId) {
    return { ok: false, status: 400, error: ASSIGNMENT_CLONE_COURSE_MISMATCH_MESSAGE };
  }
  if (input.source.subjectFamily !== input.targetSession.subjectFamily) {
    return { ok: false, status: 400, error: ASSIGNMENT_CLONE_SUBJECT_MISMATCH_MESSAGE };
  }
  if (input.source.sessionId === input.targetSession.id) {
    return { ok: false, status: 409, error: ASSIGNMENT_ALREADY_ON_SESSION_MESSAGE };
  }
  if (
    !input.allowDuplicate &&
    assignmentAlreadyOnSession(input.source, input.existingOnTarget)
  ) {
    return { ok: false, status: 409, error: ASSIGNMENT_ALREADY_ON_SESSION_MESSAGE };
  }

  return {
    ok: true,
    sourceAssignmentId: input.source.id,
    targetSessionId: input.targetSession.id,
    copiedQuestions: input.sourceQuestions.map((question) => ({
      questionId: question.questionId,
      position: question.position,
      predictionFirst: question.predictionFirst,
    })),
    mutations: {
      updateSource: false,
      updateAttempts: false,
      insertAssignment: true,
      insertQuestions: true,
    },
  };
}

export type AssignmentCloneInsert = {
  courseId: string;
  sessionId: string;
  deliveryPhase: string;
  title: string;
  subject: string;
  instructions: string;
  status: string;
  deadline: Date | null;
  timeLimitMinutes: number;
  maxAttempts: number;
};

export function buildAssignmentCloneValues(
  source: Omit<AssignmentCloneInsert, "sessionId">,
  targetSessionId: string,
  sourceQuestions: AssignmentQuestionCopy[],
): {
  assignment: AssignmentCloneInsert;
  questions: AssignmentQuestionCopy[];
} {
  return {
    assignment: {
      courseId: source.courseId,
      deliveryPhase: source.deliveryPhase,
      title: source.title,
      subject: source.subject,
      instructions: source.instructions,
      status: source.status,
      deadline: source.deadline,
      timeLimitMinutes: source.timeLimitMinutes,
      maxAttempts: source.maxAttempts,
      sessionId: targetSessionId,
    },
    questions: sourceQuestions.map((question) => ({ ...question })),
  };
}
