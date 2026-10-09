import type { RequestHandler } from "express";

const ATTEMPT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidAttemptId(value: string | null | undefined): boolean {
  return typeof value === "string" && ATTEMPT_UUID.test(value);
}

type AttemptIdResponse = {
  status: (code: number) => { json: (body: unknown) => void };
};

/** Stop a non-uuid path segment from reaching a Postgres uuid comparison. */
export function rejectInvalidAttemptId(
  res: AttemptIdResponse,
  attemptId: string | undefined,
): boolean {
  if (isUuidAttemptId(attemptId)) return false;
  res.status(400).json({ error: "Invalid attempt id" });
  return true;
}

export function invalidAttemptIdGate(): RequestHandler {
  return (req, res, next) => {
    const raw = req.params.attemptId;
    const attemptId = Array.isArray(raw) ? raw[0] : raw;
    if (rejectInvalidAttemptId(res, attemptId)) return;
    next();
  };
}
