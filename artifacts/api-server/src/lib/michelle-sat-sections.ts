import { MICHELLE_MAKAREM_USER_ID } from "./no-auto-prework-clients.ts";
import { isXavierProfileEmail, XAVIER_TYPO_EMAIL } from "./xavier-identity.ts";
import { SOPHIA_LAMAS_TUTOR_EMAIL, SOPHIA_LAMAS_TUTOR_NAME } from "./admin-calendar-fallback.ts";
import type { SatPracticeSection } from "./sat-set-difficulty.ts";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isSophiaLamasTutor(input: {
  tutorEmail?: string | null;
  tutorName?: string | null;
  sessionTitle?: string | null;
}): boolean {
  const email = normalize(input.tutorEmail);
  if (email && email === SOPHIA_LAMAS_TUTOR_EMAIL.trim().toLowerCase()) return true;
  const name = normalize(input.tutorName);
  if (name && name === SOPHIA_LAMAS_TUTOR_NAME.trim().toLowerCase()) return true;
  return /\bwith sophia lamas\b/.test(normalize(input.sessionTitle));
}

function isXavierTutor(input: {
  tutorEmail?: string | null;
  tutorName?: string | null;
  sessionTitle?: string | null;
}): boolean {
  if (isXavierProfileEmail(input.tutorEmail)) return true;
  if (normalize(input.tutorEmail) === XAVIER_TYPO_EMAIL) return true;
  const name = normalize(input.tutorName);
  if (name === "xavier morales" || name === "xavier") return true;
  return /\bwith xavier\b/.test(normalize(input.sessionTitle));
}

/**
 * Michelle's SAT work is split by tutor: Xavier is math, Sophia Lamas is
 * reading and writing. The calendar subject is still SAT for both.
 * Returns null when this is not Michelle or the tutor is unrecognized,
 * so the caller can keep its default sections.
 */
export function michelleSatSectionsForTutor(input: {
  clientUserId?: string | null;
  userId?: string | null;
  tutorEmail?: string | null;
  tutorName?: string | null;
  sessionTitle?: string | null;
}): readonly SatPracticeSection[] | null {
  const studentId = (input.clientUserId ?? input.userId)?.trim();
  if (!studentId || studentId !== MICHELLE_MAKAREM_USER_ID) return null;
  if (isXavierTutor(input)) return ["math"];
  if (isSophiaLamasTutor(input)) return ["rw"];
  return null;
}

export function isMichelleOriginalHardSourceKey(sourceKey: string | null | undefined): boolean {
  return (sourceKey ?? "").startsWith("original-hard-michelle-");
}
