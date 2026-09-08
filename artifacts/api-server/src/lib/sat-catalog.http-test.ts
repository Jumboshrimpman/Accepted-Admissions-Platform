import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { db, satProductsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import express from "express";
import platformRouter from "../routes/platform";
import {
  SINGLE_SAT_SESSION_PRICE_CENTS,
  TEN_SAT_SESSION_PACKAGE_PRICE_CENTS,
  TEST_SAT_HOUR_PRICE_CENTS,
  TEST_SAT_HOUR_SLUG,
} from "./sat-catalog";

async function startServer() {
  const app = express();
  app.use(express.json());
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

test("GET /api/public/products includes the $1 test SKU and keeps live SAT prices", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is required for SAT catalog HTTP coverage");
    return;
  }

  const [existingTestProduct] = await db
    .select({ id: satProductsTable.id })
    .from(satProductsTable)
    .where(eq(satProductsTable.slug, TEST_SAT_HOUR_SLUG))
    .limit(1);
  if (existingTestProduct) {
    await db
      .update(satProductsTable)
      .set({
        name: "test",
        description: "Temporary $1 test product that grants 1 SAT hour.",
        durationHours: 1,
        totalPriceCents: TEST_SAT_HOUR_PRICE_CENTS,
        effectiveHourlyRateCents: TEST_SAT_HOUR_PRICE_CENTS,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(satProductsTable.slug, TEST_SAT_HOUR_SLUG));
  } else {
    await db.insert(satProductsTable).values({
      slug: TEST_SAT_HOUR_SLUG,
      name: "test",
      description: "Temporary $1 test product that grants 1 SAT hour.",
      durationHours: 1,
      totalPriceCents: TEST_SAT_HOUR_PRICE_CENTS,
      effectiveHourlyRateCents: TEST_SAT_HOUR_PRICE_CENTS,
      active: true,
    });
  }

  const decoySlug = `decoy-sat-${randomUUID().slice(0, 8)}`;
  const [decoy] = await db
    .insert(satProductsTable)
    .values({
      slug: decoySlug,
      name: "Decoy",
      description: "Should not appear on public checkout.",
      durationHours: 1,
      totalPriceCents: 50,
      effectiveHourlyRateCents: 50,
      active: true,
    })
    .returning();

  const server = await startServer();
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

    const testProduct = products.find((product) => product.slug === TEST_SAT_HOUR_SLUG);
    assert.equal(testProduct?.name, "test");
    assert.equal(Number(testProduct?.durationHours), 1);
    assert.equal(Number(testProduct?.totalPriceCents), 100);

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
    if (decoy?.id) {
      await db.delete(satProductsTable).where(eq(satProductsTable.id, decoy.id));
    }
  }
});
