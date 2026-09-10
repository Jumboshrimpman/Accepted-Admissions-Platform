import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { db, satProductsTable, usersTable, type AppUser } from "@workspace/db";
import { eq } from "drizzle-orm";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import platformRouter from "../routes/platform";
import {
  RETIRED_TEST_SAT_HOUR_SLUG,
  SINGLE_SAT_SESSION_PRICE_CENTS,
  TEN_SAT_SESSION_PACKAGE_PRICE_CENTS,
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

    const single = products.find((product) => product.slug === "single-sat-session");
    if (single) {
      assert.equal(Number(single.totalPriceCents), SINGLE_SAT_SESSION_PRICE_CENTS);
      assert.equal(Number(single.durationHours), 1);
    }
    const pack = products.find((product) => product.slug === "ten-sat-session-package");
    if (pack) {
      assert.equal(Number(pack.totalPriceCents), TEN_SAT_SESSION_PACKAGE_PRICE_CENTS);
      assert.equal(Number(pack.durationHours), 10);
    }

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
      await db.delete(usersTable).where(eq(usersTable.id, student.id));
    }
  }
});
