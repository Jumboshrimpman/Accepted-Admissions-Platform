import { Router, type IRouter, type Request, type Response } from "express";
import {
  AssignSatBankPreworkBody,
  AssignSatBankPreworkParams,
  AssignSatBankPreworkResponse,
  GetSatBankCollectionParams,
  GetSatBankCollectionResponse,
  GetSessionLessonParams,
  GetSessionLessonResponse,
  ImportSatBankBody,
  ImportSatBankResponse,
  ListSatBankCollectionsResponse,
  ListSatBankQuestionsQueryParams,
  ListSatBankQuestionsResponse,
  RecordRetryOutcomeBody,
  RecordRetryOutcomeParams,
  RecordRetryOutcomeResponse,
  RequestSessionRetryBody,
  RequestSessionRetryParams,
  RequestSessionRetryResponse,
} from "@workspace/api-zod";
import { db, remediationRetriesTable, sessionsTable, type AppUser } from "@workspace/db";
import { eq } from "drizzle-orm";
import { QuestionGenerationError } from "../lib/question-generation";
import { canViewSession } from "../lib/session-privacy";
import {
  assignPreworkFromBank,
  getBankCollection,
  getSessionLesson,
  importCollegeBoardExtracts,
  listBankCollections,
  listBankQuestions,
  recordRetryOutcome,
  requestSimilarRetry,
  resetSessionPreworkState,
  resetTaitoFirstSatPrework,
} from "../lib/sat-bank-service";

type AuthedRequest = Request & { appUser?: AppUser };

const router: IRouter = Router();

function ensureRole(
  roles: AppUser["role"][],
): (req: AuthedRequest, res: Response, next: () => void) => void {
  return (req, res, next) => {
    if (!req.appUser || !roles.includes(req.appUser.role)) {
      res.status(403).json({ error: "Insufficient permission" });
      return;
    }
    next();
  };
}

function serviceError(res: Response, error: unknown, fallback: string): void {
  const status = typeof (error as { status?: number }).status === "number"
    ? (error as { status: number }).status
    : 500;
  const message = error instanceof Error ? error.message : fallback;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
}

router.post(
  "/admin/sat-bank/import",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const body = ImportSatBankBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const result = await importCollegeBoardExtracts({
      rootDir: body.data.rootDir,
      payloadText: body.data.payloadText,
    });
    res.json(ImportSatBankResponse.parse(result));
  },
);

router.get(
  "/admin/sat-bank/collections",
  ensureRole(["administrator"]),
  async (_req: AuthedRequest, res): Promise<void> => {
    const collections = await listBankCollections();
    res.json(ListSatBankCollectionsResponse.parse(collections));
  },
);

router.get(
  "/admin/sat-bank/collections/:collectionId",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GetSatBankCollectionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const collection = await getBankCollection(params.data.collectionId);
    if (!collection) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }
    res.json(GetSatBankCollectionResponse.parse(collection));
  },
);

router.get(
  "/admin/sat-bank/questions",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const query = ListSatBankQuestionsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const questions = await listBankQuestions(query.data);
    res.json(ListSatBankQuestionsResponse.parse(questions));
  },
);

router.post(
  "/admin/sat-bank/reset-first-sat-prework",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    try {
      const result = await resetTaitoFirstSatPrework({
        actorUserId: req.appUser?.id,
        reassignDiagnostic: req.body?.reassignDiagnostic !== false,
      });
      res.status(201).json(result);
    } catch (error) {
      serviceError(res, error, "Could not reset the October 2 SAT pre-work");
    }
  },
);

router.post(
  "/admin/sessions/:sessionId/reset-prework",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const sessionId =
      typeof req.params.sessionId === "string" ? req.params.sessionId.trim() : "";
    if (!sessionId) {
      res.status(400).json({ error: "Session id is required" });
      return;
    }
    const [session] = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(eq(sessionsTable.id, sessionId))
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    try {
      const reset = await resetSessionPreworkState(session.id);
      const reassignDiagnostic = req.body?.reassignDiagnostic !== false;
      const assigned = reassignDiagnostic
        ? await assignPreworkFromBank({
            sessionId: session.id,
            actorUserId: req.appUser?.id,
            homeworkKind: "diagnostic",
          })
        : null;
      res.status(201).json({
        ...reset,
        reassigned: assigned,
      });
    } catch (error) {
      serviceError(res, error, "Could not reset session pre-work");
    }
  },
);

router.post(
  "/admin/sessions/:sessionId/prework-from-bank",
  ensureRole(["administrator"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = AssignSatBankPreworkParams.safeParse(req.params);
    const body = AssignSatBankPreworkBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid pre-work assignment" });
      return;
    }
    try {
      const result = await assignPreworkFromBank({
        sessionId: params.data.sessionId,
        actorUserId: req.appUser?.id,
        collectionId: body.data.collectionId,
        bankQuestionIds: body.data.bankQuestionIds,
        homeworkKind: body.data.homeworkKind,
        targetMinutes: body.data.targetMinutes,
      });
      res.status(201).json(AssignSatBankPreworkResponse.parse(result));
    } catch (error) {
      serviceError(res, error, "Could not assign pre-work from the bank");
    }
  },
);

router.get(
  "/sessions/:sessionId/lesson",
  ensureRole(["administrator", "tutor", "student", "viewer"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = GetSessionLessonParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId))
      .limit(1);
    if (!session || !(await canViewSession(req.appUser!, session))) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const lesson = await getSessionLesson(session.id);
    res.json(GetSessionLessonResponse.parse(lesson));
  },
);

router.post(
  "/sessions/:sessionId/lesson",
  ensureRole(["administrator", "tutor", "student"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = RequestSessionRetryParams.safeParse(req.params);
    const body = RequestSessionRetryBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      res.status(400).json({ error: "A source question is required" });
      return;
    }
    const [session] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, params.data.sessionId))
      .limit(1);
    if (!session || !(await canViewSession(req.appUser!, session))) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    try {
      const result = await requestSimilarRetry({
        sessionId: session.id,
        sourceQuestionId: body.data.sourceQuestionId,
      });
      res.status(201).json(RequestSessionRetryResponse.parse(result));
    } catch (error) {
      if (error instanceof QuestionGenerationError) {
        res.status(error.status).json({
          retryId: "",
          source: "blocked",
          blockedReason: error.message,
          requiredEnv: error.statusPayload.requiredEnv,
          question: null,
        });
        return;
      }
      serviceError(res, error, "Could not create a retry");
    }
  },
);

router.post(
  "/retries/:retryId/outcome",
  ensureRole(["administrator", "tutor", "student"]),
  async (req: AuthedRequest, res): Promise<void> => {
    const params = RecordRetryOutcomeParams.safeParse(req.params);
    const body = RecordRetryOutcomeBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      res.status(400).json({ error: "A student answer is required" });
      return;
    }
    try {
      const [retry] = await db
        .select({ sessionId: remediationRetriesTable.sessionId })
        .from(remediationRetriesTable)
        .where(eq(remediationRetriesTable.id, params.data.retryId))
        .limit(1);
      const [session] = retry
        ? await db
            .select()
            .from(sessionsTable)
            .where(eq(sessionsTable.id, retry.sessionId))
            .limit(1)
        : [];
      if (!session || !(await canViewSession(req.appUser!, session))) {
        res.status(404).json({ error: "Retry not found" });
        return;
      }
      const result = await recordRetryOutcome({
        retryId: params.data.retryId,
        studentAnswer: body.data.studentAnswer,
      });
      res.json(RecordRetryOutcomeResponse.parse(result));
    } catch (error) {
      serviceError(res, error, "Could not record the retry outcome");
    }
  },
);

export default router;
