/**
 * Nika essay editing. These products are College Consulting for the same
 * client who can buy Nika's consulting hours. They are not meeting credits:
 * the async hour grants nothing bookable, and the follow-up grants exactly
 * one hour on the existing Nika consulting hour so the held call can be booked.
 */

export const NIKA_ESSAY_ASYNC_SLUG = "college-consulting-nika-essay-async";
export const NIKA_ESSAY_FOLLOWUP_SLUG = "college-consulting-nika-essay-followup";
export const ESSAY_FOLLOWUP_CREDIT_SLUG = "college-consulting-nika-hour";
export const NIKA_ESSAY_TUTOR_EMAIL = "nika.raiffe@gmail.com";
export const NIKA_ESSAY_TUTOR_NAME = "Nika Raiffe";

export const ESSAY_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const ESSAY_MINIMUM_LEAD_MS = 24 * 60 * 60 * 1000;
export const ESSAY_FOLLOWUP_DURATION_MINUTES = 60 as const;

const PDF_MAGIC = Buffer.from("%PDF-");

export const NIKA_ESSAY_SLUGS = [NIKA_ESSAY_ASYNC_SLUG, NIKA_ESSAY_FOLLOWUP_SLUG] as const;

export type EssayKind = "async" | "followup";

export const NIKA_ESSAY_PRODUCTS: ReadonlyArray<{
  slug: (typeof NIKA_ESSAY_SLUGS)[number];
  kind: EssayKind;
  name: string;
  description: string;
  durationHours: number;
  totalPriceCents: number;
  effectiveHourlyRateCents: number;
}> = [
  {
    slug: NIKA_ESSAY_ASYNC_SLUG,
    kind: "async",
    name: "Essay editing, 1 hr (async)",
    description:
      "One hour of asynchronous essay editing with Nika. Upload one PDF and choose a due time at least 24 hours later. There is no meeting.",
    durationHours: 1,
    totalPriceCents: 10_000,
    effectiveHourlyRateCents: 10_000,
  },
  {
    slug: NIKA_ESSAY_FOLLOWUP_SLUG,
    kind: "followup",
    name: "Essay editing + 1 hr follow-up call, 2 hrs",
    description:
      "One hour of asynchronous essay editing with Nika, plus a one-hour follow-up call. Upload one PDF and choose a due time at least 24 hours later. Book the call with Nika at least 24 hours after that due time.",
    durationHours: 2,
    totalPriceCents: 20_000,
    effectiveHourlyRateCents: 10_000,
  },
];

const ESSAY_SLUG_SET = new Set<string>(NIKA_ESSAY_SLUGS);

export function isNikaEssaySlug(slug: string | null | undefined): boolean {
  return Boolean(slug && ESSAY_SLUG_SET.has(slug));
}

export function nikaEssayProductBySlug(slug: string | null | undefined) {
  return NIKA_ESSAY_PRODUCTS.find((product) => product.slug === slug) ?? null;
}

export function essayKindForSlug(slug: string | null | undefined): EssayKind | null {
  return nikaEssayProductBySlug(slug)?.kind ?? null;
}

export type EssayCreditPlan = {
  meetingHours: number;
  creditSlug: string | null;
};

/** Bookable hours created when the payment webhook confirms the purchase. */
export function essayPurchaseCreditPlan(slug: string | null | undefined): EssayCreditPlan | null {
  if (slug === NIKA_ESSAY_ASYNC_SLUG) return { meetingHours: 0, creditSlug: null };
  if (slug === NIKA_ESSAY_FOLLOWUP_SLUG) {
    return { meetingHours: 1, creditSlug: ESSAY_FOLLOWUP_CREDIT_SLUG };
  }
  return null;
}

export function essayRefundHours(args: {
  slug: string;
  deltaCents: number;
  amountCents: number;
}): { hours: number; creditSlug: string | null } | null {
  const plan = essayPurchaseCreditPlan(args.slug);
  if (!plan) return null;
  if (plan.meetingHours <= 0 || args.amountCents <= 0) {
    return { hours: 0, creditSlug: plan.creditSlug };
  }
  return {
    hours: (plan.meetingHours * args.deltaCents) / args.amountCents,
    creditSlug: plan.creditSlug,
  };
}

export function leadIsAtLeast(
  from: Date,
  target: Date,
  leadMs = ESSAY_MINIMUM_LEAD_MS,
): boolean {
  return target.getTime() - from.getTime() >= leadMs;
}

export function dueAtIsFarEnough(submittedAt: Date, dueAt: Date): boolean {
  return leadIsAtLeast(submittedAt, dueAt);
}

/** The follow-up call has to start at least 24 hours after the essay due time. */
export function followUpCallIsFarEnough(dueAt: Date, callStart: Date): boolean {
  return leadIsAtLeast(dueAt, callStart);
}

/**
 * An open follow-up reserves one Nika hour. A call at least 24 hours after the
 * due time uses that hour. An earlier call can use other prepaid Nika hours.
 */
export function followUpBookingDecision(args: {
  start: Date;
  dueAt: Date;
  durationHours: number;
  nikaHoursRemaining: number;
}): "link" | "other-hours" | "too-soon" {
  if (followUpCallIsFarEnough(args.dueAt, args.start)) return "link";
  const otherHours = args.nikaHoursRemaining - 1;
  if (otherHours + 0.001 < args.durationHours) return "too-soon";
  return "other-hours";
}

export type EssayCheckoutHold = { hold: false; meetingHours: 0 | 1 };

export function essayCheckoutHold(args: {
  kind: EssayKind;
  uploadedAt: Date;
  dueAt: Date | null;
  callStart?: Date | null;
}): { ok: true; hold: EssayCheckoutHold } | { ok: false; error: string } {
  if (!args.dueAt || Number.isNaN(args.dueAt.getTime()) || !dueAtIsFarEnough(args.uploadedAt, args.dueAt)) {
    return { ok: false, error: "Choose a due time at least 24 hours from now." };
  }
  if (args.kind === "async") return { ok: true, hold: { hold: false, meetingHours: 0 } };
  return { ok: true, hold: { hold: false, meetingHours: 1 } };
}

export function essayRequestIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const id = (metadata as { essayRequestId?: unknown }).essayRequestId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function tutorIsNika(profile: {
  name?: string | null;
  email?: string | null;
}): boolean {
  const email = profile.email?.trim().toLowerCase() ?? "";
  if (email === NIKA_ESSAY_TUTOR_EMAIL) return true;
  if (email) return false;
  return profile.name?.trim() === NIKA_ESSAY_TUTOR_NAME;
}

export type EssayPdfResult =
  | { ok: true; filename: string }
  | { ok: false; error: string };

export function validateEssayPdf(
  bytes: Buffer,
  filename?: string | null,
): EssayPdfResult {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return { ok: false, error: "Upload one PDF." };
  }
  if (bytes.length > ESSAY_PDF_MAX_BYTES) {
    return { ok: false, error: "The PDF must be 10 MB or smaller." };
  }
  if (bytes.length < PDF_MAGIC.length || !bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return { ok: false, error: "That file is not a PDF." };
  }
  const cleaned = essayPdfFilename(filename);
  if (filename?.trim() && !cleaned) {
    return { ok: false, error: "Upload one PDF." };
  }
  return { ok: true, filename: cleaned || "essay.pdf" };
}

export function essayPdfFilename(filename?: string | null): string | null {
  const base = filename?.split(/[/\\]/).pop()?.trim() ?? "";
  if (!base) return null;
  const cleaned = base.replace(/[^\w.\- ()]+/g, "").slice(0, 180);
  if (!cleaned.toLowerCase().endsWith(".pdf")) return null;
  return cleaned;
}

export type EssayActor = {
  userId: string;
  role: string;
};

export function essayFileDecision(args: {
  actor: EssayActor;
  clientUserId: string;
  tutorUserId: string | null;
  status: string;
  which: "original" | "edited";
  hasEditedFile: boolean;
}): "allow" | "deny" | "missing" {
  const admin = args.actor.role === "administrator";
  const client = args.actor.userId === args.clientUserId;
  const tutor =
    args.actor.role === "tutor" &&
    Boolean(args.tutorUserId) &&
    args.actor.userId === args.tutorUserId &&
    (args.status === "submitted" || args.status === "done");
  if (!admin && !client && !tutor) return "deny";
  if (args.which === "edited" && !args.hasEditedFile) return "missing";
  if (args.which === "edited" && client && args.status !== "done") return "deny";
  if (tutor && (args.status === "pending_payment" || args.status === "cancelled")) return "deny";
  return "allow";
}

export function essayListVisible(args: {
  actor: EssayActor;
  clientUserId: string;
  tutorUserId: string | null;
  status: string;
}): boolean {
  if (args.actor.role === "administrator") return true;
  if (args.actor.userId === args.clientUserId) return true;
  return (
    args.actor.role === "tutor" &&
    args.actor.userId === args.tutorUserId &&
    (args.status === "submitted" || args.status === "done")
  );
}

export type EssayRequestView = {
  id: string;
  kind: EssayKind | string;
  status: string;
  dueAt: string;
  callStart: string | null;
  createdAt: string;
  completedAt: string | null;
  originalFilename: string;
  editedFilename: string | null;
  hasEditedFile: boolean;
  sessionId: string | null;
  clientFirstName: string;
  clientName?: string;
  clientEmail?: string;
};

export function essayRequestView(args: {
  actor: EssayActor;
  id: string;
  kind: string;
  status: string;
  dueAt: Date;
  callStart: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  originalFilename: string;
  editedFilename: string | null;
  sessionId: string | null;
  clientUserId: string;
  clientDisplayName: string;
  clientEmail: string;
  tutorUserId: string | null;
}): EssayRequestView | null {
  if (
    !essayListVisible({
      actor: args.actor,
      clientUserId: args.clientUserId,
      tutorUserId: args.tutorUserId,
      status: args.status,
    })
  ) {
    return null;
  }
  const first = args.clientDisplayName.trim().split(/\s+/)[0] || "Student";
  const view: EssayRequestView = {
    id: args.id,
    kind: args.kind,
    status: args.status,
    dueAt: args.dueAt.toISOString(),
    callStart: args.callStart ? args.callStart.toISOString() : null,
    createdAt: args.createdAt.toISOString(),
    completedAt: args.completedAt ? args.completedAt.toISOString() : null,
    originalFilename: args.originalFilename,
    editedFilename: args.editedFilename,
    hasEditedFile: Boolean(args.editedFilename),
    sessionId: args.sessionId,
    clientFirstName: first,
  };
  if (args.actor.role === "administrator") {
    view.clientName = args.clientDisplayName;
    view.clientEmail = args.clientEmail;
  }
  return view;
}

export function canUploadEditedEssay(args: {
  actor: EssayActor;
  tutorUserId: string | null;
  status: string;
}): boolean {
  if (args.status !== "submitted") return false;
  if (args.actor.role === "administrator") return true;
  return args.actor.role === "tutor" && args.actor.userId === args.tutorUserId;
}

export function canMarkEssayDone(args: {
  actor: EssayActor;
  tutorUserId: string | null;
  status: string;
  hasEditedFile: boolean;
}): boolean {
  if (!args.hasEditedFile || args.status !== "submitted") return false;
  return canUploadEditedEssay({ ...args, status: "submitted" });
}
