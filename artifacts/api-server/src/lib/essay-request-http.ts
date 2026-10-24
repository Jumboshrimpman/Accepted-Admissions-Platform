import {
  bookingSlotHoldsTable,
  db,
  essayRequestsTable,
  invoicesTable,
  paymentsTable,
  satProductsTable,
  type AppUser,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import express, { type Request, type Response, type Router } from "express";
// @ts-expect-error Native Node test execution requires the source extension.
import { isNeelDharniUser, isSamaPostgradTestStudent } from "./college-consulting.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  essayAliasReadBlocked,
  essayCheckoutHold,
  essayPdfFilename,
  nikaEssayProductBySlug,
  validateEssayPdf,
  type EssayKind,
} from "./essay-editing.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  createEssayRequest,
  essayProductBySlug,
  essaySlugForKind,
  listEssayRequestsForActor,
  loadOwnedEssayRequest,
  markEssayDone,
  nikaEssayTutor,
  readEssayFile,
  saveEditedEssay,
} from "./essay-request-store.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  checkoutHoldExpiresAt,
  checkoutHoldExpiresAtUnix,
  claimBookingSlotHold,
  releaseSlotHoldForPayment,
  SlotHoldConflict,
} from "./booking-slot-hold.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import { createCheckoutSession, stripeErrorMessage } from "./payment-service.ts";

type EssayAuthedRequest = Request & {
  appUser?: AppUser;
  temporaryTutorAlias?: string;
};

type SlotIntent = {
  tutorProfileId: string;
  startTime: string;
  durationMinutes: number;
};

export function mountEssayRequestRoutes(
  router: Router,
  student: express.RequestHandler,
  tutor: express.RequestHandler,
  assertSlotOpen: (userId: string, intent: SlotIntent) => Promise<void>,
): void {
  const pdf = express.raw({ type: "application/pdf", limit: "10mb" });
  router.get("/essay-requests", (req, res) => {
    void listEssayRequests(req, res);
  });
  router.post("/essay-requests", student, pdf, (req, res) => {
    void receiveEssayUpload(req, res, assertSlotOpen);
  });
  router.get("/essay-requests/:id/file", (req, res) => {
    void downloadEssayFile(req, res);
  });
  router.post("/essay-requests/:id/edited", tutor, pdf, (req, res) => {
    void uploadEditedEssay(req, res);
  });
  router.post("/essay-requests/:id/done", tutor, (req, res) => {
    void completeEssayRequest(req, res);
  });
}

function queryString(req: Request, key: string): string {
  const value = req.query[key];
  return typeof value === "string" ? value.trim() : "";
}

function actorOf(user: AppUser) {
  return { userId: user.id, role: user.role };
}

function bookingFailure(error: unknown): { status: number; code: string; error: string } | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { status?: unknown; code?: unknown; message?: unknown };
  if (typeof record.status !== "number" || typeof record.code !== "string") return null;
  if (typeof record.message !== "string" || !record.message) return null;
  return { status: record.status, code: record.code, error: record.message };
}

function publicAppOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  throw new Error("APP_ORIGIN must be configured for hosted payment redirects");
}

function contentDisposition(filename: string): string {
  const cleaned = filename.replace(/["\r\n]/g, "");
  return `attachment; filename="${cleaned}"`;
}

function mayBuyNikaEssay(user: AppUser): boolean {
  return isNeelDharniUser(user.id) || isSamaPostgradTestStudent(user);
}

function denyAliasEssayRead(req: EssayAuthedRequest, res: Response): boolean {
  if (
    !essayAliasReadBlocked({
      temporaryTutorAlias: req.temporaryTutorAlias,
      role: req.appUser?.role,
    })
  ) {
    return false;
  }
  res.status(403).json({ error: "You cannot view this essay." });
  return true;
}

export async function receiveEssayUpload(
  req: Request & { appUser?: AppUser },
  res: Response,
  assertSlotOpen: (userId: string, intent: SlotIntent) => Promise<void>,
): Promise<void> {
  const user = req.appUser;
  if (!user || !mayBuyNikaEssay(user)) {
    res.status(403).json({ error: "Essay editing is offered with Nika only." });
    return;
  }
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const filename = essayPdfFilename(queryString(req, "filename")) ?? queryString(req, "filename");
  const pdf = validateEssayPdf(bytes, filename || null);
  if (!pdf.ok) {
    res.status(400).json({ error: pdf.error });
    return;
  }
  const kind = queryString(req, "kind");
  if (kind !== "async" && kind !== "followup") {
    res.status(400).json({ error: "Choose an essay editing option." });
    return;
  }
  const uploadedAt = new Date();
  const dueAt = new Date(queryString(req, "dueAt"));
  const hold = essayCheckoutHold({
    kind,
    uploadedAt,
    dueAt,
  });
  if (!hold.ok) {
    res.status(400).json({ error: hold.error });
    return;
  }
  const tutor = await nikaEssayTutor();
  if (!tutor) {
    res.status(404).json({ error: "Nika is not available for essay editing." });
    return;
  }
  const slug = essaySlugForKind(kind);
  const product = slug ? await essayProductBySlug(db, slug) : null;
  const created = await createEssayRequest({
    clientUserId: user.id,
    tutorProfileId: tutor.id,
    productId: product?.id ?? null,
    kind,
    dueAt,
    callStart: null,
    filename: pdf.filename,
    bytes,
  });
  res.status(201).json({
    id: created.id,
    kind: created.kind,
    status: created.status,
    dueAt: created.dueAt.toISOString(),
    callStart: created.callStart ? created.callStart.toISOString() : null,
  });
}

export async function listEssayRequests(
  req: EssayAuthedRequest,
  res: Response,
): Promise<void> {
  const user = req.appUser;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (denyAliasEssayRead(req, res)) return;
  res.json(await listEssayRequestsForActor(actorOf(user)));
}

export async function downloadEssayFile(
  req: EssayAuthedRequest,
  res: Response,
): Promise<void> {
  const user = req.appUser;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (denyAliasEssayRead(req, res)) return;
  const requestId = typeof req.params.id === "string" ? req.params.id : "";
  const which = queryString(req, "which") === "edited" ? "edited" : "original";
  const file = await readEssayFile({
    actor: actorOf(user),
    requestId,
    which,
  });
  if (file.decision === "missing") {
    res.status(404).json({ error: "The edited PDF is not ready yet." });
    return;
  }
  if (file.decision !== "allow") {
    res.status(403).json({ error: "You cannot download this essay." });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", contentDisposition(file.filename));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(file.bytes);
}

export async function uploadEditedEssay(
  req: Request & { appUser?: AppUser },
  res: Response,
): Promise<void> {
  const user = req.appUser;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const pdf = validateEssayPdf(bytes, queryString(req, "filename") || null);
  if (!pdf.ok) {
    res.status(400).json({ error: pdf.error });
    return;
  }
  const requestId = typeof req.params.id === "string" ? req.params.id : "";
  const saved = await saveEditedEssay({
    actor: actorOf(user),
    requestId,
    filename: pdf.filename,
    bytes,
  });
  if (!saved.ok) {
    res.status(saved.status).json({ error: saved.error });
    return;
  }
  res.json({ ok: true });
}

export async function completeEssayRequest(
  req: Request & { appUser?: AppUser },
  res: Response,
): Promise<void> {
  const user = req.appUser;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const requestId = typeof req.params.id === "string" ? req.params.id : "";
  const done = await markEssayDone({ actor: actorOf(user), requestId });
  if (!done.ok) {
    res.status(done.status).json({ error: done.error });
    return;
  }
  res.json({ ok: true });
}

export async function handleEssayCheckoutRequest(
  req: Request & { appUser?: AppUser },
  res: Response,
  assertSlotOpen: (userId: string, intent: SlotIntent) => Promise<void>,
): Promise<void> {
  const user = req.appUser;
  if (!user || !mayBuyNikaEssay(user)) {
    res.status(403).json({ error: "Essay editing is offered with Nika only." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const requestId = typeof body.essayRequestId === "string" ? body.essayRequestId.trim() : "";
  const owned = await loadOwnedEssayRequest(requestId, user.id);
  if (!owned) {
    res.status(404).json({ error: "Essay request not found." });
    return;
  }
  const request = owned.request;
  if (request.status !== "pending_payment") {
    res.status(409).json({ error: "This essay request is already paid." });
    return;
  }
  if (owned.paymentStatus === "pending") {
    res.status(409).json({ error: "Finish the open checkout or wait for it to expire." });
    return;
  }
  if (owned.paymentStatus === "paid") {
    res.status(409).json({ error: "This essay request is already paid." });
    return;
  }
  const kind = request.kind === "followup" ? "followup" : request.kind === "async" ? "async" : null;
  if (!kind) {
    res.status(400).json({ error: "Choose an essay editing option." });
    return;
  }
  const hold = essayCheckoutHold({
    kind: kind as EssayKind,
    // created_at is a moment after the upload clock, so an exact 24-hour choice still passes.
    uploadedAt: new Date(request.createdAt.getTime() - 60_000),
    dueAt: request.dueAt,
  });
  if (!hold.ok) {
    res.status(400).json({ error: hold.error });
    return;
  }
  if (request.dueAt.getTime() <= Date.now()) {
    res.status(400).json({ error: "That due time has passed. Upload the essay again." });
    return;
  }
  const slug = essaySlugForKind(kind);
  const catalog = slug ? nikaEssayProductBySlug(slug) : null;
  const product = slug ? await essayProductBySlug(db, slug) : null;
  if (!product || !catalog) {
    res.status(404).json({ error: "Essay editing is not on the catalog yet." });
    return;
  }
  if (
    product.totalPriceCents !== catalog.totalPriceCents ||
    product.name !== catalog.name ||
    product.description !== catalog.description
  ) {
    const [aligned] = await db
      .update(satProductsTable)
      .set({
        name: catalog.name,
        description: catalog.description,
        totalPriceCents: catalog.totalPriceCents,
        effectiveHourlyRateCents: catalog.effectiveHourlyRateCents,
        durationHours: catalog.durationHours,
        stripeProductId: null,
        stripePriceId: null,
        updatedAt: new Date(),
      })
      .where(eq(satProductsTable.id, product.id))
      .returning();
    if (aligned) Object.assign(product, aligned);
  }
  const chargeCents = catalog.totalPriceCents;
  const bookingIntent = null;
  const holdExpiresAt = null;
  void assertSlotOpen;
  let invoice: typeof invoicesTable.$inferSelect;
  let payment: typeof paymentsTable.$inferSelect;
  try {
    [invoice, payment] = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from essay_requests where id = ${request.id} for update`);
      const [fresh] = await tx
        .select()
        .from(essayRequestsTable)
        .where(eq(essayRequestsTable.id, request.id))
        .limit(1);
      if (!fresh || fresh.status !== "pending_payment") {
        throw new Error("ESSAY_ALREADY_PAID");
      }
      if (fresh.paymentId) {
        const [existingPayment] = await tx
          .select({ status: paymentsTable.status })
          .from(paymentsTable)
          .where(eq(paymentsTable.id, fresh.paymentId))
          .limit(1);
        if (existingPayment && (existingPayment.status === "pending" || existingPayment.status === "paid")) {
          throw new Error(existingPayment.status === "paid" ? "ESSAY_ALREADY_PAID" : "ESSAY_CHECKOUT_OPEN");
        }
      }
      const [createdInvoice] = await tx
        .insert(invoicesTable)
        .values({
          clientUserId: user.id,
          status: "pending",
          provider: "stripe_checkout",
          description: product.name,
          clientName: user.displayName,
          clientEmail: user.email,
          lineItems: [
            {
              description: product.name,
              quantity: 1,
              unitPriceCents: chargeCents,
              productId: product.id,
            },
          ],
          subtotalCents: chargeCents,
          totalCents: chargeCents,
          createdBy: user.id,
        })
        .returning();
      const [createdPayment] = await tx
        .insert(paymentsTable)
        .values({
          clientUserId: user.id,
          invoiceId: createdInvoice!.id,
          productId: product.id,
          amountCents: chargeCents,
          tutorShareCents: 0,
          platformShareCents: chargeCents,
          status: "pending",
          method: "stripe_checkout",
          auditMetadata: {
            offer: product.slug,
            owner: "accepted_admissions",
            customerEmail: user.email,
            essayRequestId: request.id,
            creditsGrantedOnPaidWebhook: hold.hold.meetingHours,
            catalogPriceCents: chargeCents,
            ...(bookingIntent ? { bookingIntent } : {}),
          },
        })
        .returning();
      await tx
        .update(essayRequestsTable)
        .set({ paymentId: createdPayment!.id, productId: product.id, updatedAt: new Date() })
        .where(eq(essayRequestsTable.id, request.id));
      if (bookingIntent && holdExpiresAt) {
        await claimBookingSlotHold(tx, {
          tutorProfileId: bookingIntent.tutorProfileId,
          tutorUserId: owned.tutorUserId,
          clientUserId: user.id,
          paymentId: createdPayment!.id,
          start: new Date(bookingIntent.startTime),
          durationMinutes: bookingIntent.durationMinutes,
          expiresAt: holdExpiresAt,
        });
      }
      return [createdInvoice!, createdPayment!] as const;
    });
  } catch (error) {
    if (error instanceof SlotHoldConflict) {
      res.status(error.status).json({ code: error.code, error: error.message });
      return;
    }
    if (error instanceof Error && error.message === "ESSAY_CHECKOUT_OPEN") {
      res.status(409).json({ error: "Finish the open checkout or wait for it to expire." });
      return;
    }
    if (error instanceof Error && error.message === "ESSAY_ALREADY_PAID") {
      res.status(409).json({ error: "This essay request is already paid." });
      return;
    }
    throw error;
  }
  try {
    const origin = publicAppOrigin();
    const successUrl = bookingIntent
      ? `${origin}/portal?payment=success&bookPayment=${payment.id}`
      : `${origin}/portal/sat?payment=success`;
    const cancelUrl = `${origin}/portal/sat?payment=canceled`;
    const checkout = await createCheckoutSession({
      user,
      product,
      invoiceId: invoice.id,
      paymentId: payment.id,
      successUrl,
      cancelUrl,
      unitAmountCents: chargeCents,
      expiresAtUnix: holdExpiresAt ? checkoutHoldExpiresAtUnix(holdExpiresAt) : undefined,
    });
    if (holdExpiresAt && checkout.expiresAt) {
      await db
        .update(bookingSlotHoldsTable)
        .set({
          expiresAt: new Date(checkout.expiresAt * 1000),
          updatedAt: new Date(),
        })
        .where(eq(bookingSlotHoldsTable.paymentId, payment.id));
    }
    await db
      .update(paymentsTable)
      .set({
        providerCheckoutSessionId: checkout.id,
        providerPaymentIntentId: checkout.paymentIntentId,
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.id, payment.id));
    res.status(201).json({
      paymentId: payment.id,
      invoiceId: invoice.id,
      status: "pending",
      url: checkout.url,
    });
  } catch (error) {
    await db.transaction(async (tx) => {
      await releaseSlotHoldForPayment(tx, payment.id);
      await tx
        .update(paymentsTable)
        .set({
          status: "failed",
          failureReason: stripeErrorMessage(error),
          updatedAt: new Date(),
        })
        .where(eq(paymentsTable.id, payment.id));
      await tx.update(invoicesTable).set({ status: "failed" }).where(eq(invoicesTable.id, invoice.id));
    });
    res.status(502).json({ error: stripeErrorMessage(error) });
  }
}
