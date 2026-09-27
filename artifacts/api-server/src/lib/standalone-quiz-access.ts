export function isStandaloneStudentQuiz(assignment: {
  sessionId?: string | null;
  assignedStudentUserId?: string | null;
}): boolean {
  return assignment.sessionId == null && Boolean(assignment.assignedStudentUserId);
}

/**
 * The tutor named on a session-less student to-do can review that submission
 * even when the quiz is not linked to a meeting.
 */
export function tutorOwnsStandaloneQuiz(input: {
  tutorUserId: string;
  studentUserId: string;
  assignment: {
    sessionId?: string | null;
    assignedStudentUserId?: string | null;
    assignedTutorUserId?: string | null;
  };
}): boolean {
  return (
    isStandaloneStudentQuiz(input.assignment) &&
    input.assignment.assignedStudentUserId === input.studentUserId &&
    Boolean(input.assignment.assignedTutorUserId) &&
    input.assignment.assignedTutorUserId === input.tutorUserId
  );
}
