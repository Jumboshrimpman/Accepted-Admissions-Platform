import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  auditLogsTable,
  coursesTable,
  courseMembershipsTable,
  creditLedgerTable,
  db,
  invoicesTable,
  loginActivityTable,
  paymentsTable,
  satProductsTable,
  sessionsTable,
  tutorProfilesTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import platformRouter from "../routes/platform";
import {
  NEEL_DHARNI_USER_ID,
  NIKA_CONSULTING_EMAIL,
  VICTORIA_USER_ID,
  isNeelDharniUser,
} from "./college-consulting";
import { CANONICAL_XAVIER_EMAIL } from "./xavier-identity";
import {
  MICHELLE_MAKAREM_CLERK_USER_ID,
  MICHELLE_MAKAREM_EMAIL,
} from "./calendar-pair-attendees";
import { isMichelleMakaremUser } from "./sat-tutor-pricing";
import { resetStripeClientForTests } from "./stripe-client";

const SOPHIA_SLEIMAN_USER_ID = "bf530aa6-faaa-43df-b3cf-140026f3313e";

const CONSULTING_CHECKOUT = [
  ["nika", 60, "college-consulting-nika-hour", 10_000],
  ["nika", 90, "college-consulting-nika-90", 15_000],
  ["nika", 120, "college-consulting-nika-120", 20_000],
  ["victoria", 60, "college-consulting-victoria-hour", 13_000],
  ["victoria", 90, "college-consulting-victoria-90", 19_500],
  ["victoria", 120, "college-consulting-victoria-120", 26_000],
  ["xavier", 60, "college-consulting-xavier-hour", 20_000],
  ["xavier", 90, "college-consulting-xavier-90", 30_000],
  ["xavier", 120, "college-consulting-xavier-120", 40_000],
] as const;

function testAuthMiddleware(user: AppUser) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = Object.assign(
      () => ({
        tokenType: "session_token",
        userId: user.clerkUserId,
        sessionClaims: {
          userId: user.clerkUserId,
          email: user.email,
          name: user.displayName,
        },
        sessionId: `booking-checkout-http:${user.id}`,
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startServer(user: AppUser) {
  const app = express();
  app.use(express.json());
  app.use(testAuthMiddleware(user));
  app.use("/api", platformRouter);
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    parsed = JSON.parse(text) as Record<string, unknown>;
  }
  return { response, body: parsed };
}

async function profileByEmail(email: string) {
  const [profile] = await db
    .select()
    .from(tutorProfilesTable)
    .where(eq(tutorProfilesTable.email, email))
    .limit(1);
  return profile ?? null;
}

async function productBySlug(slug: string) {
  const [product] = await db
    .select()
    .from(satProductsTable)
    .where(eq(satProductsTable.slug, slug))
    .limit(1);
  return product ?? null;
}

test("direct checkout and credit pools apply to every bookable client", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for booking checkout HTTP coverage");
    return;
  }

  const suffix = randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdLedgerIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdCourseIds: string[] = [];
  const createdSessionIds: string[] = [];
  const productSnapshots = new Map<
    string,
    {
      name: string;
      description: string;
      totalPriceCents: number;
      effectiveHourlyRateCents: number;
      stripeProductId: string | null;
      stripePriceId: string | null;
      active: boolean;
    }
  >();

  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  const previousOrigin = process.env.APP_ORIGIN;
  const previousStripeKey = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  resetStripeClientForTests();
  process.env.APP_ORIGIN = "https://booking-checkout.test";

  let neelServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let satServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let michelleServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let reusedMichelleId: string | undefined;
  let reusedMichelleMemberships: (typeof courseMembershipsTable.$inferSelect)[] = [];
  let activityStartedAt = new Date();
  let neel: AppUser | undefined;

  try {
  const [createdNeel] = await db
    .insert(usersTable)
    .values({
      id: NEEL_DHARNI_USER_ID,
      clerkUserId: `booking-checkout-neel:${suffix}`,
      email: `booking-checkout-neel-${suffix}@example.invalid`,
      displayName: "Neel Dharni",
      role: "student",
    })
    .returning();
  neel = createdNeel;
  createdUserIds.push(neel!.id);

  const [satStudent] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `booking-checkout-sat:${suffix}`,
      email: `booking-checkout-sat-${suffix}@example.invalid`,
      displayName: "Sophia Sleiman",
      role: "student",
    })
    .returning();
  createdUserIds.push(satStudent!.id);
  assert.equal(isNeelDharniUser(satStudent!.id), false);
  assert.notEqual(satStudent!.id, SOPHIA_SLEIMAN_USER_ID);
  assert.equal(isNeelDharniUser(SOPHIA_SLEIMAN_USER_ID), false);

  const [victoriaUser] = await db
    .insert(usersTable)
    .values({
      id: VICTORIA_USER_ID,
      clerkUserId: `booking-checkout-victoria:${suffix}`,
      email: `booking-checkout-victoria-${suffix}@example.invalid`,
      displayName: "Victoria",
      role: "tutor",
    })
    .returning();
  createdUserIds.push(victoriaUser!.id);
  const [victoriaProfile] = await db
    .insert(tutorProfilesTable)
    .values({
      userId: victoriaUser!.id,
      email: victoriaUser!.email,
      name: "Victoria",
      title: "College Consulting Tutor",
      subjects: ["College Consulting"],
    })
    .returning();
  createdProfileIds.push(victoriaProfile!.id);

  const nikaProfile = await profileByEmail(NIKA_CONSULTING_EMAIL);
  const xavierProfile = await profileByEmail(CANONICAL_XAVIER_EMAIL);
  assert.ok(nikaProfile, "Nika tutor profile is required");
  assert.ok(xavierProfile, "Xavier tutor profile is required");

  const [euniceProfile] = await db
    .insert(tutorProfilesTable)
    .values({
      email: `booking-checkout-eunice-${suffix}@example.invalid`,
      name: "Eunice Chon",
      title: "SAT Tutor",
      subjects: ["SAT"],
      bookingEligible: true,
    })
    .returning();
  createdProfileIds.push(euniceProfile!.id);
  const [satVictoriaProfile] = await db
    .insert(tutorProfilesTable)
    .values({
      email: `booking-checkout-sat-victoria-${suffix}@example.invalid`,
      name: "Victoria Wijerathnayapa",
      title: "SAT Tutor",
      subjects: ["SAT"],
      bookingEligible: true,
    })
    .returning();
  createdProfileIds.push(satVictoriaProfile!.id);

  const existingMichelle = await db
    .select()
    .from(usersTable)
    .where(
      or(
        eq(usersTable.email, MICHELLE_MAKAREM_EMAIL),
        eq(usersTable.clerkUserId, MICHELLE_MAKAREM_CLERK_USER_ID),
      ),
    );
  let michelle = existingMichelle.find(
    (user) =>
      user.clerkUserId === MICHELLE_MAKAREM_CLERK_USER_ID &&
      user.email === MICHELLE_MAKAREM_EMAIL,
  ) ?? existingMichelle[0];
  if (michelle) {
    reusedMichelleId = michelle.id;
    reusedMichelleMemberships = await db
      .select()
      .from(courseMembershipsTable)
      .where(eq(courseMembershipsTable.userId, michelle.id));
  }
  if (!michelle) {
    const [createdMichelle] = await db
      .insert(usersTable)
      .values({
        clerkUserId: MICHELLE_MAKAREM_CLERK_USER_ID,
        email: MICHELLE_MAKAREM_EMAIL,
        displayName: "Michelle Makarem",
        role: "student",
      })
      .returning();
    michelle = createdMichelle;
    createdUserIds.push(michelle!.id);
  }
  assert.ok(michelle);
  assert.equal(isMichelleMakaremUser(michelle), true);
  assert.equal(michelle.role === "student" || michelle.role === "administrator", true);

  const consultingProfiles = {
    nika: nikaProfile!.id,
    victoria: victoriaProfile!.id,
    xavier: xavierProfile!.id,
  };

  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = [
    neel!.clerkUserId,
    satStudent!.clerkUserId,
    michelle.clerkUserId,
  ].join(",");

    activityStartedAt = new Date();
    neelServer = await startServer(neel!);
    satServer = await startServer(satStudent!);
    michelleServer = await startServer(michelle);

    const xavierHour = await productBySlug("college-consulting-xavier-hour");
    const nikaHour = await productBySlug("college-consulting-nika-hour");
    const victoriaHour = await productBySlug("college-consulting-victoria-hour");
    assert.ok(xavierHour && nikaHour && victoriaHour);

    const creditCases = [
      { productId: xavierHour.id, blocked: ["nika", "victoria"] as const },
      { productId: nikaHour.id, blocked: ["xavier", "victoria"] as const },
      { productId: victoriaHour.id, blocked: ["xavier", "nika"] as const },
    ];
    for (const creditCase of creditCases) {
      const [ledger] = await db
        .insert(creditLedgerTable)
        .values({
          clientUserId: neel!.id,
          productId: creditCase.productId,
          entryType: "original",
          hours: 2,
          note: `booking-checkout-http-${suffix}`,
        })
        .returning();
      createdLedgerIds.push(ledger!.id);
      for (const tutorKey of creditCase.blocked) {
        const booked = await postJson(neelServer.baseUrl, "/api/booking/sessions", {
          tutorProfileId: consultingProfiles[tutorKey],
          startTime: "2026-12-01T15:00:00.000Z",
          durationMinutes: 60,
        });
        assert.equal(booked.response.status, 409, JSON.stringify(booked.body));
        assert.equal(booked.body.code, "INSUFFICIENT_CREDIT");
      }
      await db.delete(creditLedgerTable).where(eq(creditLedgerTable.id, ledger!.id));
    }

    for (const [index, [tutorKey, minutes, slug, cents]] of CONSULTING_CHECKOUT.entries()) {
      const product = await productBySlug(slug);
      assert.ok(product, slug);
      assert.equal(Number(product.totalPriceCents), cents, slug);
      if (!productSnapshots.has(product.id)) {
        productSnapshots.set(product.id, {
          name: product.name,
          description: product.description,
          totalPriceCents: Number(product.totalPriceCents),
          effectiveHourlyRateCents: Number(product.effectiveHourlyRateCents),
          stripeProductId: product.stripeProductId,
          stripePriceId: product.stripePriceId,
          active: product.active,
        });
      }
      const startTime = new Date(Date.UTC(2026, 11, 2, 15, index, 0)).toISOString();
      const checkout = await postJson(neelServer.baseUrl, "/api/payments/checkout", {
        tutorProfileId: consultingProfiles[tutorKey],
        durationMinutes: minutes,
        startTime,
        amountCents: 1,
        priceCents: 1,
      });
      assert.equal(checkout.response.status, 502, `${slug} ${JSON.stringify(checkout.body)}`);
      assert.equal("url" in checkout.body && Boolean(checkout.body.url), false);
      const payments = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.clientUserId, neel!.id));
      const payment = payments.find((row) => {
        const intent = (row.auditMetadata as { bookingIntent?: { startTime?: string } } | null)
          ?.bookingIntent;
        return intent?.startTime === startTime;
      });
      assert.ok(payment, slug);
      createdPaymentIds.push(payment.id);
      if (payment.invoiceId) createdInvoiceIds.push(payment.invoiceId);
      assert.equal(Number(payment.amountCents), cents, slug);
      assert.notEqual(Number(payment.amountCents), 1);
      assert.equal(payment.productId, product.id);
      assert.equal((payment.auditMetadata as { offer?: string }).offer, slug);
    }

    const satCheckouts = [
      {
        tutorProfileId: xavierProfile!.id,
        durationMinutes: 90,
        slug: "sat-xavier-90",
        cents: 30_000,
      },
      {
        tutorProfileId: euniceProfile!.id,
        durationMinutes: 60,
        slug: "sat-eunice-60",
        cents: 13_000,
      },
      {
        tutorProfileId: satVictoriaProfile!.id,
        durationMinutes: 120,
        slug: "sat-victoria-120",
        cents: 26_000,
      },
    ];
    for (const [index, item] of satCheckouts.entries()) {
      const product = await productBySlug(item.slug);
      assert.ok(product, item.slug);
      assert.equal(Number(product.totalPriceCents), item.cents, item.slug);
      const startTime = new Date(Date.UTC(2026, 11, 3, 15, index, 0)).toISOString();
      const checkout = await postJson(satServer.baseUrl, "/api/payments/checkout", {
        tutorProfileId: item.tutorProfileId,
        durationMinutes: item.durationMinutes,
        startTime,
        amountCents: 1,
        totalPriceCents: 1,
      });
      assert.equal(checkout.response.status, 502, `${item.slug} ${JSON.stringify(checkout.body)}`);
      const payments = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.clientUserId, satStudent!.id));
      const payment = payments.find((row) => {
        const intent = (row.auditMetadata as { bookingIntent?: { startTime?: string } } | null)
          ?.bookingIntent;
        return intent?.startTime === startTime;
      });
      assert.ok(payment, item.slug);
      createdPaymentIds.push(payment.id);
      if (payment.invoiceId) createdInvoiceIds.push(payment.invoiceId);
      assert.equal(payment.productId, product.id, item.slug);
      assert.equal(Number(payment.amountCents), item.cents, item.slug);
      assert.notEqual(Number(payment.amountCents), 1);
      assert.equal((payment.auditMetadata as { offer?: string }).offer, item.slug);
    }

    const michelleXavier = [
      { durationMinutes: 60, slug: "sat-xavier-60", chargeCents: 13_000, catalogCents: 20_000 },
      { durationMinutes: 90, slug: "sat-xavier-90", chargeCents: 19_500, catalogCents: 30_000 },
      { durationMinutes: 120, slug: "sat-xavier-120", chargeCents: 26_000, catalogCents: 40_000 },
    ] as const;
    for (const [index, item] of michelleXavier.entries()) {
      const product = await productBySlug(item.slug);
      assert.ok(product, item.slug);
      assert.equal(Number(product.totalPriceCents), item.catalogCents, item.slug);
      const startTime = new Date(Date.UTC(2026, 11, 3, 16, index, 0)).toISOString();
      const checkout = await postJson(michelleServer!.baseUrl, "/api/payments/checkout", {
        tutorProfileId: xavierProfile!.id,
        durationMinutes: item.durationMinutes,
        startTime,
        amountCents: 1,
        priceCents: 1,
        unitAmountCents: 1,
        totalPriceCents: 1,
      });
      assert.equal(checkout.response.status, 502, `${item.slug} ${JSON.stringify(checkout.body)}`);
      const payments = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.clientUserId, michelle!.id));
      const payment = payments.find((row) => {
        const intent = (row.auditMetadata as { bookingIntent?: { startTime?: string } } | null)
          ?.bookingIntent;
        return intent?.startTime === startTime;
      });
      assert.ok(payment, item.slug);
      createdPaymentIds.push(payment.id);
      if (payment.invoiceId) createdInvoiceIds.push(payment.invoiceId);
      const metadata = payment.auditMetadata as {
        offer?: string;
        catalogPriceCents?: number;
        clientPriceOverride?: boolean;
        bookingIntent?: { tutorProfileId?: string; durationMinutes?: number };
      };
      assert.equal(payment.productId, product.id, item.slug);
      assert.equal(Number(payment.amountCents), item.chargeCents, item.slug);
      assert.notEqual(Number(payment.amountCents), item.catalogCents, item.slug);
      assert.notEqual(Number(payment.amountCents), 1);
      assert.equal(metadata.offer, item.slug);
      assert.equal(metadata.catalogPriceCents, item.catalogCents);
      assert.equal(metadata.clientPriceOverride, true);
      assert.equal(metadata.bookingIntent?.tutorProfileId, xavierProfile!.id);
      assert.equal(metadata.bookingIntent?.durationMinutes, item.durationMinutes);
    }

    const pendingStart = "2026-12-04T15:00:00.000Z";
    const satXavier = await productBySlug("sat-xavier-90");
    assert.ok(satXavier);
    const [pendingInvoice] = await db
      .insert(invoicesTable)
      .values({
        clientUserId: satStudent!.id,
        status: "pending",
        provider: "stripe_checkout",
        description: "Pending booking checkout",
        clientEmail: satStudent!.email,
        subtotalCents: 30_000,
        totalCents: 30_000,
      })
      .returning();
    createdInvoiceIds.push(pendingInvoice!.id);
    const [pendingPayment] = await db
      .insert(paymentsTable)
      .values({
        clientUserId: satStudent!.id,
        invoiceId: pendingInvoice!.id,
        productId: satXavier.id,
        amountCents: 30_000,
        tutorShareCents: 0,
        platformShareCents: 30_000,
        status: "pending",
        method: "stripe_checkout",
        auditMetadata: {
          offer: satXavier.slug,
          bookingIntent: {
            tutorProfileId: xavierProfile!.id,
            startTime: pendingStart,
            durationMinutes: 90,
          },
        },
      })
      .returning();
    createdPaymentIds.push(pendingPayment!.id);
    const pendingBooking = await postJson(
      satServer.baseUrl,
      "/api/booking/sessions/from-payment",
      { paymentId: pendingPayment!.id },
    );
    assert.equal(pendingBooking.response.status, 409, JSON.stringify(pendingBooking.body));
    assert.equal(pendingBooking.body.code, "PAYMENT_NOT_CONFIRMED");

    const [course] = await db
      .insert(coursesTable)
      .values({
        title: `Booking checkout fixture ${suffix}`,
        subject: "SAT",
        term: "Fall 2026",
        status: "active",
      })
      .returning();
    createdCourseIds.push(course!.id);
    const [bookedSession] = await db
      .insert(sessionsTable)
      .values({
        courseId: course!.id,
        clientUserId: satStudent!.id,
        dateTime: new Date("2026-12-05T15:00:00.000Z"),
        timezone: "America/New_York",
        subject: "SAT",
        title: "Already reserved",
        status: "published",
        durationMinutes: 90,
        bookingStatus: "confirmed",
      })
      .returning();
    createdSessionIds.push(bookedSession!.id);
    const [paidInvoice] = await db
      .insert(invoicesTable)
      .values({
        clientUserId: satStudent!.id,
        status: "paid",
        provider: "stripe_checkout",
        description: "Paid booking checkout",
        clientEmail: satStudent!.email,
        subtotalCents: 30_000,
        totalCents: 30_000,
      })
      .returning();
    createdInvoiceIds.push(paidInvoice!.id);
    const [paidPayment] = await db
      .insert(paymentsTable)
      .values({
        clientUserId: satStudent!.id,
        invoiceId: paidInvoice!.id,
        productId: satXavier.id,
        amountCents: 30_000,
        tutorShareCents: 0,
        platformShareCents: 30_000,
        status: "paid",
        method: "stripe_checkout",
        auditMetadata: {
          offer: satXavier.slug,
          bookedSessionId: bookedSession!.id,
          bookingIntent: {
            tutorProfileId: xavierProfile!.id,
            startTime: "2026-12-05T15:00:00.000Z",
            durationMinutes: 90,
          },
        },
      })
      .returning();
    createdPaymentIds.push(paidPayment!.id);
    const returned = await postJson(satServer.baseUrl, "/api/booking/sessions/from-payment", {
      paymentId: paidPayment!.id,
    });
    assert.equal(returned.response.status, 201, JSON.stringify(returned.body));
    assert.equal(returned.body.id, bookedSession!.id);

    const [shortInvoice] = await db
      .insert(invoicesTable)
      .values({
        clientUserId: satStudent!.id,
        status: "paid",
        provider: "stripe_checkout",
        description: "Paid without hours",
        clientEmail: satStudent!.email,
        subtotalCents: 13_000,
        totalCents: 13_000,
      })
      .returning();
    createdInvoiceIds.push(shortInvoice!.id);
    const [shortPayment] = await db
      .insert(paymentsTable)
      .values({
        clientUserId: satStudent!.id,
        invoiceId: shortInvoice!.id,
        productId: satXavier.id,
        amountCents: 13_000,
        tutorShareCents: 0,
        platformShareCents: 13_000,
        status: "paid",
        method: "stripe_checkout",
        auditMetadata: {
          offer: "sat-eunice-60",
          bookingIntent: {
            tutorProfileId: euniceProfile!.id,
            startTime: "2026-12-06T15:00:00.000Z",
            durationMinutes: 60,
          },
        },
      })
      .returning();
    createdPaymentIds.push(shortPayment!.id);
    const shortBooking = await postJson(satServer.baseUrl, "/api/booking/sessions/from-payment", {
      paymentId: shortPayment!.id,
    });
    assert.equal(shortBooking.response.status, 409, JSON.stringify(shortBooking.body));
    assert.equal(shortBooking.body.code, "INSUFFICIENT_CREDIT");

    const legacyProduct = await productBySlug("single-sat-session");
    assert.ok(legacyProduct);
    assert.equal(Number(legacyProduct.totalPriceCents), 13_000);
    const beforeLegacy = await postJson(satServer.baseUrl, "/api/booking/sessions", {
      tutorProfileId: euniceProfile!.id,
      startTime: "2026-12-07T15:00:00.000Z",
      durationMinutes: 60,
    });
    assert.equal(beforeLegacy.response.status, 409, JSON.stringify(beforeLegacy.body));
    assert.equal(beforeLegacy.body.code, "INSUFFICIENT_CREDIT");
    const [legacyLedger] = await db
      .insert(creditLedgerTable)
      .values({
        clientUserId: satStudent!.id,
        productId: legacyProduct.id,
        entryType: "original",
        hours: 2,
        note: `booking-checkout-legacy-${suffix}`,
      })
      .returning();
    createdLedgerIds.push(legacyLedger!.id);
    for (const tutor of [euniceProfile!, satVictoriaProfile!]) {
      const covered = await postJson(satServer.baseUrl, "/api/booking/sessions", {
        tutorProfileId: tutor.id,
        startTime: "2026-12-07T16:00:00.000Z",
        durationMinutes: 60,
      });
      assert.equal(covered.response.status, 409, JSON.stringify(covered.body));
      assert.notEqual(covered.body.code, "INSUFFICIENT_CREDIT");
      assert.equal(covered.body.code, "AVAILABILITY_NOT_CONFIGURED");
    }
    const xavierLegacy = await postJson(satServer.baseUrl, "/api/booking/sessions", {
      tutorProfileId: xavierProfile!.id,
      startTime: "2026-12-08T15:00:00.000Z",
      durationMinutes: 60,
    });
    assert.equal(xavierLegacy.response.status, 409, JSON.stringify(xavierLegacy.body));
    assert.equal(xavierLegacy.body.code, "INSUFFICIENT_CREDIT");
    await db.delete(creditLedgerTable).where(eq(creditLedgerTable.id, legacyLedger!.id));
  } finally {
    await neelServer?.close();
    await satServer?.close();
    await michelleServer?.close();
    if (createdLedgerIds.length > 0) {
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.id, createdLedgerIds));
    }
    if (createdPaymentIds.length > 0) {
      await db.delete(paymentsTable).where(inArray(paymentsTable.id, createdPaymentIds));
    }
    if (createdInvoiceIds.length > 0) {
      await db.delete(invoicesTable).where(inArray(invoicesTable.id, createdInvoiceIds));
    }
    if (createdSessionIds.length > 0) {
      await db.delete(sessionsTable).where(inArray(sessionsTable.id, createdSessionIds));
    }
    if (reusedMichelleId) {
      await db
        .delete(loginActivityTable)
        .where(eq(loginActivityTable.clerkSessionId, `booking-checkout-http:${reusedMichelleId}`));
      await db
        .delete(auditLogsTable)
        .where(
          and(
            eq(auditLogsTable.actorUserId, reusedMichelleId),
            gte(auditLogsTable.createdAt, activityStartedAt),
          ),
        );
      await db
        .delete(courseMembershipsTable)
        .where(eq(courseMembershipsTable.userId, reusedMichelleId));
      if (reusedMichelleMemberships.length > 0) {
        await db.insert(courseMembershipsTable).values(reusedMichelleMemberships);
      }
    }
    if (createdUserIds.length > 0) {
      await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, createdUserIds));
      await db.delete(auditLogsTable).where(inArray(auditLogsTable.actorUserId, createdUserIds));
      await db
        .delete(courseMembershipsTable)
        .where(inArray(courseMembershipsTable.userId, createdUserIds));
      await db.delete(creditLedgerTable).where(inArray(creditLedgerTable.clientUserId, createdUserIds));
    }
    if (createdCourseIds.length > 0) {
      await db.delete(coursesTable).where(inArray(coursesTable.id, createdCourseIds));
    }
    for (const [productId, snapshot] of productSnapshots) {
      await db
        .update(satProductsTable)
        .set({ ...snapshot, updatedAt: new Date() })
        .where(eq(satProductsTable.id, productId));
    }
    if (createdProfileIds.length > 0) {
      await db.delete(tutorProfilesTable).where(inArray(tutorProfilesTable.id, createdProfileIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
    }
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
    if (previousStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousStripeKey;
    resetStripeClientForTests();
  }
});
