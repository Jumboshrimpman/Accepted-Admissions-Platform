import { and, eq } from "drizzle-orm";

/** Only the student account can hide or restore their own quiz. */
export function studentMayResolveQuizzes(role: string | null | undefined): boolean {
  return role === "student";
}

/**
 * Whose resolution row applies to this listed quiz.
 * Students and viewers use the mirrored student. Staff use the session client
 * when the list is for one session, otherwise the assigned student.
 */
export function resolutionStudentIdForListedAssignment(input: {
  role: string;
  subjectUserId: string;
  sessionScoped: boolean;
  sessionClientUserId: string | null;
  assignedStudentUserId: string | null;
}): string | null {
  if (input.role === "student" || input.role === "viewer") return input.subjectUserId;
  if (input.sessionScoped && input.sessionClientUserId) return input.sessionClientUserId;
  return input.assignedStudentUserId ?? input.sessionClientUserId;
}

async function resolutionTable() {
  const { db, studentQuizResolutionsTable } = await import("@workspace/db");
  return { db, studentQuizResolutionsTable };
}

/** Insert is a no-op when this student already resolved the assignment. */
export async function resolveStudentQuizRecord(input: {
  studentUserId: string;
  assignmentId: string;
}): Promise<Date> {
  const { db, studentQuizResolutionsTable } = await resolutionTable();
  await db
    .insert(studentQuizResolutionsTable)
    .values({
      studentUserId: input.studentUserId,
      assignmentId: input.assignmentId,
    })
    .onConflictDoNothing({
      target: [
        studentQuizResolutionsTable.studentUserId,
        studentQuizResolutionsTable.assignmentId,
      ],
    });
  const [row] = await db
    .select({ resolvedAt: studentQuizResolutionsTable.resolvedAt })
    .from(studentQuizResolutionsTable)
    .where(
      and(
        eq(studentQuizResolutionsTable.studentUserId, input.studentUserId),
        eq(studentQuizResolutionsTable.assignmentId, input.assignmentId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("Quiz resolution was not stored");
  return row.resolvedAt;
}

/** Removes only the resolution row. Assignments and attempts stay. */
export async function clearStudentQuizResolution(input: {
  studentUserId: string;
  assignmentId: string;
}): Promise<void> {
  const { db, studentQuizResolutionsTable } = await resolutionTable();
  await db
    .delete(studentQuizResolutionsTable)
    .where(
      and(
        eq(studentQuizResolutionsTable.studentUserId, input.studentUserId),
        eq(studentQuizResolutionsTable.assignmentId, input.assignmentId),
      ),
    );
}
