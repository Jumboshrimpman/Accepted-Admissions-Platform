/**
 * Delete in-session homework attempts for one session.
 *
 * Keeps the during_session assignment and its questions. Does not archive
 * homework, rematerialize a question bank, or touch before_session diagnostics
 * or any other session.
 *
 * Dry-run unless --apply is present. Requires DATABASE_URL on the API host.
 * No Clerk token.
 *
 *   cd artifacts/api-server
 *   node --experimental-strip-types src/scripts/clear-in-session-homework.ts \
 *     --session-id=1cc3dea5-9532-4dc2-9cea-3d1e5d65d119 \
 *     --expect-email=samapostgrad@gmail.com
 *   node --experimental-strip-types src/scripts/clear-in-session-homework.ts \
 *     --session-id=1cc3dea5-9532-4dc2-9cea-3d1e5d65d119 \
 *     --expect-email=samapostgrad@gmail.com \
 *     --apply
 *
 * See docs/clear-in-session-homework.md.
 */
import { eq } from "drizzle-orm";
import {
  assignmentsTable,
  attemptsTable,
  db,
  pool,
  sessionsTable,
  usersTable,
} from "@workspace/db";
import { clearSessionHomeworkAttempts } from "../lib/sat-bank-service.ts";

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim();
}

const sessionId = flag("session-id");
const expectEmail = flag("expect-email")?.toLowerCase();
const apply = process.argv.includes("--apply");

if (!sessionId || !expectEmail) {
  console.error(
    "Usage: node --experimental-strip-types src/scripts/clear-in-session-homework.ts --session-id=<uuid> --expect-email=<client email> [--apply]",
  );
  process.exit(1);
}

try {
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);
  if (!session) {
    throw new Error(`Session ${sessionId} was not found.`);
  }
  const [client] = session.clientUserId
    ? await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, session.clientUserId))
        .limit(1)
    : [];
  if (!client || client.email.trim().toLowerCase() !== expectEmail) {
    throw new Error(
      `Refusing to clear. Client email is ${client?.email ?? "missing"}, expected ${expectEmail}.`,
    );
  }

  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.sessionId, session.id));
  const summary = [];
  for (const assignment of assignments) {
    const attempts = await db
      .select({
        id: attemptsTable.id,
        status: attemptsTable.status,
        score: attemptsTable.score,
      })
      .from(attemptsTable)
      .where(eq(attemptsTable.assignmentId, assignment.id));
    summary.push({
      assignmentId: assignment.id,
      title: assignment.title,
      deliveryPhase: assignment.deliveryPhase,
      status: assignment.status,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        status: attempt.status,
        score: attempt.score,
      })),
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply,
        sessionId: session.id,
        title: session.title,
        clientEmail: client.email,
        clientName: client.displayName,
        assignments: summary,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to delete during_session attempts.");
  } else {
    const cleared = await clearSessionHomeworkAttempts(session.id, {
      deliveryPhase: "during_session",
    });
    const remaining = await db
      .select({
        id: attemptsTable.id,
        assignmentId: attemptsTable.assignmentId,
      })
      .from(attemptsTable)
      .innerJoin(assignmentsTable, eq(assignmentsTable.id, attemptsTable.assignmentId))
      .where(eq(assignmentsTable.sessionId, session.id));
    console.log(
      JSON.stringify(
        {
          cleared,
          remainingAttempts: remaining,
          verify: [
            "during_session attempts for this session should be gone.",
            "before_session attempts, including a reset diagnostic, should still be listed above if they existed.",
            "Assignment rows and questions were kept. No bank rematerialize.",
          ],
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
