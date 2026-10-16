import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  adminNotificationsTable,
  clientIntakeAssignmentsTable,
  clientIntakeResponsesTable,
  db,
  usersTable,
  type AppUser,
} from "@workspace/db";
import {
  clientIntakeAdminNotification,
  intakeIsBuiltIn,
  planIntakeAssignment,
  studentIntakeBody,
  validateClientIntake,
} from "../lib/client-intake";

type AuthedRequest = Request & {
  appUser?: AppUser;
};

const clientIntakeRouter: IRouter = Router();

function userId(req: AuthedRequest): string | null {
  return req.appUser?.id ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && (current as { code?: string }).code === "23505") return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

clientIntakeRouter.get("/me/client-intake", async (req: AuthedRequest, res: Response) => {
  const id = userId(req);
  if (req.appUser?.role !== "student" || !id) {
    res.json(studentIntakeBody(null));
    return;
  }
  const [assignment] = await db
    .select({ status: clientIntakeAssignmentsTable.status })
    .from(clientIntakeAssignmentsTable)
    .where(eq(clientIntakeAssignmentsTable.clientUserId, id))
    .limit(1);
  res.json(studentIntakeBody(assignment ?? null, id));
});

clientIntakeRouter.post("/me/client-intake", async (req: AuthedRequest, res: Response) => {
  const id = userId(req);
  if (req.appUser?.role !== "student" || !id) {
    res.status(403).json({ error: "Intake is for client accounts." });
    return;
  }
  const [assignment] = await db
    .select()
    .from(clientIntakeAssignmentsTable)
    .where(eq(clientIntakeAssignmentsTable.clientUserId, id))
    .limit(1);
  const builtIn = intakeIsBuiltIn(id);
  if (!assignment && !builtIn) {
    res.status(404).json({ error: "Intake is not assigned." });
    return;
  }
  if (assignment?.status === "completed") {
    res.status(409).json(studentIntakeBody(assignment));
    return;
  }
  const parsed = validateClientIntake((req.body ?? {}) as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ errors: parsed.errors });
    return;
  }
  const submittedAt = new Date();
  const note = clientIntakeAdminNotification(req.appUser.displayName);
  try {
    await db.transaction(async (tx) => {
      let assignmentId = assignment?.id ?? null;
      if (!assignmentId) {
        const [created] = await tx
          .insert(clientIntakeAssignmentsTable)
          .values({
            clientUserId: id,
            status: "completed",
            completedAt: submittedAt,
            updatedAt: submittedAt,
          })
          .returning({ id: clientIntakeAssignmentsTable.id });
        assignmentId = created?.id ?? null;
      } else {
        const [updated] = await tx
          .update(clientIntakeAssignmentsTable)
          .set({
            status: "completed",
            completedAt: submittedAt,
            updatedAt: submittedAt,
          })
          .where(
            and(
              eq(clientIntakeAssignmentsTable.id, assignmentId),
              eq(clientIntakeAssignmentsTable.status, "assigned"),
            ),
          )
          .returning({ id: clientIntakeAssignmentsTable.id });
        if (!updated) throw new Error("ALREADY_COMPLETED");
      }
      if (!assignmentId) throw new Error("ALREADY_COMPLETED");
      await tx.insert(clientIntakeResponsesTable).values({
        assignmentId,
        clientUserId: id,
        respondentName: parsed.value.name,
        email: parsed.value.email,
        phone: parsed.value.phone,
        latestSatScore: parsed.value.latestSatScore,
        latestGpa: parsed.value.latestGpa,
        school: parsed.value.school,
        dreamUniversity1: parsed.value.dreamUniversity1,
        dreamUniversity2: parsed.value.dreamUniversity2,
        dreamUniversity3: parsed.value.dreamUniversity3,
        targetSafetySchool: parsed.value.targetSafetySchool,
        mainFocus: parsed.value.mainFocus,
        targetSatDate: parsed.value.targetSatDate,
      });
      const admins = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.role, "administrator"));
      if (admins.length > 0) {
        await tx.insert(adminNotificationsTable).values(
          admins.map((admin) => ({
            recipientUserId: admin.id,
            kind: note.kind,
            title: note.title,
            message: note.message,
          })),
        );
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_COMPLETED") {
      res.status(409).json(studentIntakeBody({ status: "completed" }));
      return;
    }
    if (isUniqueViolation(error)) {
      res.status(409).json(studentIntakeBody({ status: "completed" }));
      return;
    }
    throw error;
  }
  res.json(studentIntakeBody({ status: "completed" }));
});

clientIntakeRouter.get("/admin/client-intakes", async (req: AuthedRequest, res: Response) => {
  if (req.appUser?.role !== "administrator") {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }
  const rows = await db
    .select({
      id: clientIntakeAssignmentsTable.id,
      clientUserId: clientIntakeAssignmentsTable.clientUserId,
      clientDisplayName: usersTable.displayName,
      status: clientIntakeAssignmentsTable.status,
      assignedAt: clientIntakeAssignmentsTable.assignedAt,
      completedAt: clientIntakeAssignmentsTable.completedAt,
      response: clientIntakeResponsesTable,
    })
    .from(clientIntakeAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, clientIntakeAssignmentsTable.clientUserId))
    .leftJoin(
      clientIntakeResponsesTable,
      eq(clientIntakeResponsesTable.assignmentId, clientIntakeAssignmentsTable.id),
    )
    .orderBy(desc(clientIntakeAssignmentsTable.assignedAt));
  res.json({
    assignments: rows.map((row) => ({
      id: row.id,
      clientUserId: row.clientUserId,
      clientDisplayName: row.clientDisplayName,
      status: row.status,
      assignedAt: row.assignedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      response: row.response?.id
        ? {
            name: row.response.respondentName,
            email: row.response.email,
            phone: row.response.phone,
            latestSatScore: row.response.latestSatScore,
            latestGpa: row.response.latestGpa,
            school: row.response.school,
            dreamUniversities: [
              row.response.dreamUniversity1,
              row.response.dreamUniversity2,
              row.response.dreamUniversity3,
            ],
            targetSafetySchool: row.response.targetSafetySchool,
            mainFocus: row.response.mainFocus,
            targetSatDate: row.response.targetSatDate,
            submittedAt: row.response.submittedAt.toISOString(),
          }
        : null,
    })),
  });
});

clientIntakeRouter.post("/admin/client-intakes", async (req: AuthedRequest, res: Response) => {
  if (req.appUser?.role !== "administrator") {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }
  const clientUserId =
    typeof (req.body as { clientUserId?: unknown } | null)?.clientUserId === "string"
      ? (req.body as { clientUserId: string }).clientUserId.trim()
      : "";
  if (!/^[0-9a-f-]{36}$/i.test(clientUserId)) {
    res.status(400).json({ error: "Choose a client." });
    return;
  }
  const [client] = await db
    .select({ id: usersTable.id, role: usersTable.role, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.id, clientUserId))
    .limit(1);
  const [existing] = await db
    .select({ status: clientIntakeAssignmentsTable.status, id: clientIntakeAssignmentsTable.id })
    .from(clientIntakeAssignmentsTable)
    .where(eq(clientIntakeAssignmentsTable.clientUserId, clientUserId))
    .limit(1);
  const plan = planIntakeAssignment({
    client: client ?? null,
    existing: existing ?? null,
  });
  if (plan.action === "missing") {
    res.status(404).json({ error: "Client not found." });
    return;
  }
  if (plan.action === "not_student") {
    res.status(400).json({ error: "Intake can be assigned to a client account." });
    return;
  }
  if (plan.action === "insert") {
    await db.insert(clientIntakeAssignmentsTable).values({
      clientUserId,
      assignedByUserId: req.appUser.id,
    });
  }
  res.json({
    clientUserId,
    clientDisplayName: client!.displayName,
    status: existing?.status ?? "assigned",
  });
});

export default clientIntakeRouter;
