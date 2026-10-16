export type CalendarOAuthNonceRecord = {
  nonce: string;
  tutorProfileId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type CalendarOAuthNonceRejection = "missing" | "used" | "expired" | "tutor_mismatch";

export function calendarOAuthNonceAdmission(input: {
  nonce: string;
  tutorProfileId: string;
  record: CalendarOAuthNonceRecord | null;
  now: number;
}): { ok: true } | { ok: false; reason: CalendarOAuthNonceRejection } {
  const record = input.record;
  if (!record || record.nonce !== input.nonce) return { ok: false, reason: "missing" };
  if (record.tutorProfileId !== input.tutorProfileId) {
    return { ok: false, reason: "tutor_mismatch" };
  }
  if (record.usedAt) return { ok: false, reason: "used" };
  const expiresAt = record.expiresAt.getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= input.now) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export function calendarOAuthNonceFailureMessage(
  reason: CalendarOAuthNonceRejection,
): { outcome: "expired"; message: string } {
  if (reason === "used") {
    return {
      outcome: "expired",
      message: "This reconnect link was already used. Ask an administrator for a new one.",
    };
  }
  if (reason === "tutor_mismatch") {
    return {
      outcome: "expired",
      message: "This reconnect link belongs to a different tutor. Ask an administrator for a new one.",
    };
  }
  return {
    outcome: "expired",
    message: "This reconnect link expired. Ask an administrator for a new one.",
  };
}
