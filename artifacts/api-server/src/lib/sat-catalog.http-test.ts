import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  courseMembershipsTable,
  db,
  invoicesTable,
  loginActivityTable,
  paymentsTable,
  satProductsTable,
  usersTable,
  type AppUser,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import platformRouter from "../routes/platform";
import { MICHELLE_MAKAREM_EMAIL } from "./calendar-pair-attendees";
import {
  RETIRED_TEST_SAT_HOUR_SLUG,
  SINGLE_SAT_SESSION_PRICE_CENTS,
} from "./sat-catalog";

function testAuthMiddleware(user?: AppUser) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = Object.assign(
      () =>
        user
          ? {
              tokenType: "session_token",
              userId: user.clerkUserId,
              sessionClaims: {
                userId: user.clerkUserId,
                email: user.email,
                name: user.displayName,
              },
              sessionId: `sat-catalog-http-test:${user.id}`,
            }
          : {
              tokenType: "session_token",
              userId: null,
              sessionClaims: null,
              sessionId: null,
            },
      { [Symbol.for("@clerk/express.auth")]: true },
    );
    (req as Request & { auth?: unknown }).auth = auth;
    next();
  };
}

async function startServer(user?: AppUser) {
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

async function ensureRetiredTestProductActive() {
  const [existing] = await db
    .select({ id: satProductsTable.id })
    .from(satProductsTable)
    .where(eq(satProductsTable.slug, RETIRED_TEST_SAT_HOUR_SLUG))
    .limit(1);
  if (existing) {
    await db
      .update(satProductsTable)
      .set({
        name: "test",
        description: "Temporary $1 test product that grants 1 SAT hour.",
        durationHours: 1,
        totalPriceCents: 100,
        effectiveHourlyRateCents: 100,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(satProductsTable.slug, RETIRED_TEST_SAT_HOUR_SLUG));
    return;
  }
  await db.insert(satProductsTable).values({
    slug: RETIRED_TEST_SAT_HOUR_SLUG,
    name: "test",
    description: "Temporary $1 test product that grants 1 SAT hour.",
    durationHours: 1,
    totalPriceCents: 100,
    effectiveHourlyRateCents: 100,
    active: true,
  });
}

test("GET /api/public/products requires authentication", async () => {
  const server = await startServer();
  try {
    const response = await fetch(`${server.baseUrl}/api/public/products`);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, "Authentication required");
  } finally {
    await server.close();
  }
});

test("authenticated GET /api/public/products lists live SAT prices and omits the retired test SKU", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for SAT catalog HTTP coverage");
    return;
  }

  await ensureRetiredTestProductActive();

  const suffix = randomUUID().slice(0, 8);
  const [student] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `sat-catalog-student:${suffix}`,
      email: `sat-catalog-student-${suffix}@example.invalid`,
      displayName: "SAT Catalog Student",
      role: "student",
    })
    .returning();
  const decoySlug = `decoy-sat-${suffix}`;
  const [decoy] = await db
    .insert(satProductsTable)
    .values({
      slug: decoySlug,
      name: "Decoy",
      description: "Should not appear on authenticated checkout.",
      durationHours: 1,
      totalPriceCents: 50,
      effectiveHourlyRateCents: 50,
      active: true,
    })
    .returning();

  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = student!.clerkUserId;
  const server = await startServer(student);
  try {
    const response = await fetch(`${server.baseUrl}/api/public/products`);
    assert.equal(response.status, 200);
    const products = (await response.json()) as Array<{
      slug: string;
      name: string;
      durationHours: number;
      totalPriceCents: number;
    }>;
    assert.equal(Array.isArray(products), true);
    assert.equal(
      products.some((product) => product.slug === RETIRED_TEST_SAT_HOUR_SLUG),
      false,
    );
    assert.equal(
      products.some((product) => product.name.toLowerCase() === "test"),
      false,
    );
    assert.equal(
      products.some((product) => Number(product.totalPriceCents) === 100),
      false,
    );

    for (const slug of [
      "single-sat-session",
      "ten-sat-session-package",
      "sat-session-90",
      "sat-session-120",
    ]) {
      assert.equal(
        products.some((product) => product.slug === slug),
        false,
        `${slug} is no longer offered`,
      );
    }
    const eunice = products.find((product) => product.slug === "sat-eunice-60");
    const xavier = products.find((product) => product.slug === "sat-xavier-60");
    assert.equal(Number(eunice?.totalPriceCents), SINGLE_SAT_SESSION_PRICE_CENTS);
    assert.equal(products.some((product) => product.slug.startsWith("sat-victoria")), false);
    assert.equal(Number(xavier?.totalPriceCents), 20_000);
    assert.equal(
      products.filter((product) => /^(sat-eunice|sat-xavier)-/.test(product.slug)).length,
      6,
    );
    assert.equal(
      products.some((product) => product.slug.startsWith("sat-nika-")),
      false,
    );

    assert.equal(
      products.some((product) => product.slug === decoySlug),
      false,
    );
  } finally {
    await server.close();
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    if (decoy?.id) {
      await db.delete(satProductsTable).where(eq(satProductsTable.id, decoy.id));
    }
    if (student?.id) {
      await db.delete(loginActivityTable).where(eq(loginActivityTable.userId, student.id));
      await db.delete(courseMembershipsTable).where(eq(courseMembershipsTable.userId, student.id));
      await db.delete(usersTable).where(eq(usersTable.id, student.id));
    }
  }
});

test("checkout charges Michelle $130 for Xavier SAT and $200 for everyone else", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for SAT checkout coverage");
    return;
  }
  const suffix = randomUUID().slice(0, 8);
  const [emailTaken] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, MICHELLE_MAKAREM_EMAIL))
    .limit(1);
  if (emailTaken) {
    t.skip("Michelle's email is already present in this database");
    return;
  }
  const [michelle] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `michelle-checkout:${suffix}`,
      email: MICHELLE_MAKAREM_EMAIL,
      displayName: "Michelle Makarem",
      role: "student",
    })
    .returning();
  const [sophia] = await db
    .insert(usersTable)
    .values({
      clerkUserId: `sophia-checkout:${suffix}`,
      email: `sophia-checkout-${suffix}@example.invalid`,
      displayName: "Sophia Sleiman",
      role: "student",
    })
    .returning();
  const createdIds = [michelle!.id, sophia!.id];
  const previousStudentIds = process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
  process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = [michelle!.clerkUserId, sophia!.clerkUserId].join(",");
  let michelleServer: Awaited<ReturnType<typeof startServer>> | undefined;
  let sophiaServer: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    michelleServer = await startServer(michelle);
    sophiaServer = await startServer(sophia);
    const listed = await fetch(`${sophiaServer.baseUrl}/api/public/products`);
    assert.equal(listed.status, 200);
    const products = (await listed.json()) as Array<{ id: string; slug: string; totalPriceCents: number }>;
    const xavier = products.find((product) => product.slug === "sat-xavier-60");
    assert.ok(xavier);
    assert.equal(Number(xavier.totalPriceCents), 20_000);
    assert.equal(products.some((product) => product.slug.startsWith("sat-nika-")), false);
    const michelleProductsResponse = await fetch(`${michelleServer.baseUrl}/api/public/products`);
    assert.equal(michelleProductsResponse.status, 200);
    const michelleProducts = (await michelleProductsResponse.json()) as Array<{
      id: string;
      slug: string;
      name: string;
      totalPriceCents: number;
    }>;
    const nikaHour = michelleProducts.find((product) => product.slug === "sat-nika-60");
    const nikaNinety = michelleProducts.find((product) => product.slug === "sat-nika-90");
    const nikaTwoHours = michelleProducts.find((product) => product.slug === "sat-nika-120");
    assert.equal(nikaHour?.name, "SAT 1 hour with Nika");
    assert.equal(Number(nikaHour?.totalPriceCents), 13_000);
    assert.equal(Number(nikaNinety?.totalPriceCents), 19_500);
    assert.equal(Number(nikaTwoHours?.totalPriceCents), 26_000);
    const sophiaNikaCheckout = await fetch(`${sophiaServer.baseUrl}/api/payments/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: nikaHour?.id, amountCents: 100 }),
    });
    assert.equal(sophiaNikaCheckout.status, 404);
    const [storedBefore] = await db
      .select({
        totalPriceCents: satProductsTable.totalPriceCents,
        stripePriceId: satProductsTable.stripePriceId,
      })
      .from(satProductsTable)
      .where(eq(satProductsTable.id, xavier.id))
      .limit(1);
    const [legacy] = await db
      .select({ id: satProductsTable.id })
      .from(satProductsTable)
      .where(eq(satProductsTable.slug, "single-sat-session"))
      .limit(1);
    if (legacy) {
      const rejected = await fetch(`${sophiaServer.baseUrl}/api/payments/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: legacy.id }),
      });
      assert.equal(rejected.status, 403);
      const rejectedBody = (await rejected.json()) as { error?: string };
      assert.equal(rejectedBody.error, "Choose a tutor to buy SAT hours.");
    }
    if (process.env.STRIPE_SECRET_KEY) {
      t.diagnostic("skipped live Stripe amount check");
      return;
    }
    const michelleCheckout = await fetch(`${michelleServer.baseUrl}/api/payments/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: xavier.id }),
    });
    assert.equal(michelleCheckout.status, 502);
    const sophiaCheckout = await fetch(`${sophiaServer.baseUrl}/api/payments/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: xavier.id }),
    });
    assert.equal(sophiaCheckout.status, 502);
    const rows = await db
      .select({
        clientUserId: paymentsTable.clientUserId,
        amountCents: paymentsTable.amountCents,
        productId: paymentsTable.productId,
      })
      .from(paymentsTable)
      .where(inArray(paymentsTable.clientUserId, createdIds));
    assert.equal(rows.find((row) => row.clientUserId === michelle!.id)?.amountCents, 13_000);
    assert.equal(rows.find((row) => row.clientUserId === sophia!.id)?.amountCents, 20_000);
    assert.equal(rows.every((row) => row.productId === xavier.id), true);
    const [storedAfter] = await db
      .select({
        totalPriceCents: satProductsTable.totalPriceCents,
        stripePriceId: satProductsTable.stripePriceId,
      })
      .from(satProductsTable)
      .where(eq(satProductsTable.id, xavier.id))
      .limit(1);
    assert.equal(Number(storedAfter?.totalPriceCents), 20_000);
    assert.equal(storedAfter?.stripePriceId ?? null, storedBefore?.stripePriceId ?? null);
  } finally {
    await michelleServer?.close();
    await sophiaServer?.close();
    if (previousStudentIds === undefined) delete process.env.ACCEPTED_STUDENT_CLERK_USER_IDS;
    else process.env.ACCEPTED_STUDENT_CLERK_USER_IDS = previousStudentIds;
    const payments = await db
      .select({ id: paymentsTable.id, invoiceId: paymentsTable.invoiceId })
      .from(paymentsTable)
      .where(inArray(paymentsTable.clientUserId, createdIds));
    if (payments.length > 0) {
      await db.delete(paymentsTable).where(inArray(paymentsTable.clientUserId, createdIds));
    }
    const invoiceIds = payments.map((payment) => payment.invoiceId).filter((id): id is string => Boolean(id));
    if (invoiceIds.length > 0) {
      await db.delete(invoicesTable).where(inArray(invoicesTable.id, invoiceIds));
    }
    await db.delete(loginActivityTable).where(inArray(loginActivityTable.userId, createdIds));
    await db.delete(courseMembershipsTable).where(inArray(courseMembershipsTable.userId, createdIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdIds));
  }
});
