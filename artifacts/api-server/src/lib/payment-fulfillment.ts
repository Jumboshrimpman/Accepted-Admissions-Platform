import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  auditLogsTable,
  creditLedgerTable,
  db,
  paymentsTable,
  satProductsTable,
  usersTable,
} from "@workspace/db";
// @ts-expect-error Native Node test execution requires the source extension.
import { PAID_STATUSES_NEEDING_PURCHASE_CREDIT, missingProductFulfillmentError, purchaseCreditFulfillmentKey, purchaseCreditHours } from "./payment-fulfillment-rules.ts";

export async function grantPaidPurchaseCredits(
  tx: any,
  args: {
    payment: {
      id: string;
      clientUserId: string | null;
      productId?: string | null;
    };
    product:
      | {
          id: string;
          name: string;
          durationHours: unknown;
        }
      | null
      | undefined;
    note?: string;
    createdBy?: string | null;
  },
): Promise<{ hours: number; inserted: boolean }> {
  if (!args.payment.clientUserId) {
    throw new Error(
      `Payment ${args.payment.id} cannot be fulfilled without a client user. Credits were not granted.`,
    );
  }
  if (!args.product) {
    throw missingProductFulfillmentError(args.payment.id, args.payment.productId);
  }
  const hours = purchaseCreditHours(args.product);
  const [inserted] = await tx
    .insert(creditLedgerTable)
    .values({
      clientUserId: args.payment.clientUserId,
      productId: args.product.id,
      entryType: "original",
      hours,
      referenceType: "payment",
      referenceId: args.payment.id,
      fulfillmentKey: purchaseCreditFulfillmentKey(args.payment.id),
      note: args.note ?? `${args.product.name} purchase`,
      createdBy: args.createdBy ?? undefined,
    })
    .onConflictDoNothing({ target: creditLedgerTable.fulfillmentKey })
    .returning({ id: creditLedgerTable.id });
  return { hours, inserted: Boolean(inserted) };
}

export type PaymentCreditMismatch = {
  paymentId: string;
  clientUserId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  expectedHours: number | null;
  amountCents: number;
  status: string;
  method: string;
  paidAt: Date | null;
  createdAt: Date;
  reason: "missing_credit" | "product_missing";
};

export async function listPaidUncreditedPayments(limit = 100): Promise<PaymentCreditMismatch[]> {
  const recentPaid = await db
    .select({
      paymentId: paymentsTable.id,
      clientUserId: paymentsTable.clientUserId,
      clientName: usersTable.displayName,
      clientEmail: usersTable.email,
      productId: paymentsTable.productId,
      productName: satProductsTable.name,
      productSlug: satProductsTable.slug,
      expectedHours: satProductsTable.durationHours,
      amountCents: paymentsTable.amountCents,
      status: paymentsTable.status,
      method: paymentsTable.method,
      paidAt: paymentsTable.paidAt,
      createdAt: paymentsTable.createdAt,
    })
    .from(paymentsTable)
    .leftJoin(satProductsTable, eq(satProductsTable.id, paymentsTable.productId))
    .leftJoin(usersTable, eq(usersTable.id, paymentsTable.clientUserId))
    .where(
      and(
        inArray(paymentsTable.status, [...PAID_STATUSES_NEEDING_PURCHASE_CREDIT]),
        isNotNull(paymentsTable.productId),
      ),
    )
    .orderBy(desc(paymentsTable.paidAt), desc(paymentsTable.createdAt))
    .limit(Math.max(1, Math.min(limit, 200)));

  if (recentPaid.length === 0) return [];

  const keys = recentPaid.map((row) => purchaseCreditFulfillmentKey(row.paymentId));
  const existing = await db
    .select({ fulfillmentKey: creditLedgerTable.fulfillmentKey })
    .from(creditLedgerTable)
    .where(inArray(creditLedgerTable.fulfillmentKey, keys));
  const credited = new Set(
    existing
      .map((row) => row.fulfillmentKey)
      .filter((key): key is string => typeof key === "string"),
  );

  return recentPaid
    .filter((row) => !credited.has(purchaseCreditFulfillmentKey(row.paymentId)))
    .map((row) => ({
      ...row,
      expectedHours:
        row.expectedHours === null || row.expectedHours === undefined
          ? null
          : Number(row.expectedHours),
      reason: row.productId && row.productName ? "missing_credit" : "product_missing",
    }));
}

export type BackfillPaidCreditsResult = {
  dryRun: boolean;
  scanned: number;
  granted: Array<{
    paymentId: string;
    hours: number;
    productSlug: string | null;
    inserted: boolean;
  }>;
  skipped: Array<{ paymentId: string; reason: string }>;
};

export async function backfillPaidUncreditedPayments(options: {
  paymentId?: string;
  dryRun?: boolean;
  actorUserId?: string | null;
  limit?: number;
} = {}): Promise<BackfillPaidCreditsResult> {
  const dryRun = options.dryRun !== false;
  const mismatches = await listPaidUncreditedPayments(options.limit ?? 100);
  const selected = options.paymentId
    ? mismatches.filter((row) => row.paymentId === options.paymentId)
    : mismatches;

  const granted: BackfillPaidCreditsResult["granted"] = [];
  const skipped: BackfillPaidCreditsResult["skipped"] = [];

  if (options.paymentId && selected.length === 0) {
    skipped.push({
      paymentId: options.paymentId,
      reason: "not_a_paid_uncredited_payment",
    });
  }

  for (const row of selected) {
    if (!row.productId || row.reason === "product_missing" || row.expectedHours === null) {
      skipped.push({ paymentId: row.paymentId, reason: "product_missing" });
      continue;
    }
    if (dryRun) {
      granted.push({
        paymentId: row.paymentId,
        hours: row.expectedHours,
        productSlug: row.productSlug,
        inserted: false,
      });
      continue;
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select id from payments where id = ${row.paymentId} for update`);
      const [payment] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.id, row.paymentId))
        .limit(1);
      if (!payment?.clientUserId || !payment.productId) {
        return { skipped: "payment_missing" as const };
      }
      const [product] = await tx
        .select()
        .from(satProductsTable)
        .where(eq(satProductsTable.id, payment.productId))
        .limit(1);
      const credit = await grantPaidPurchaseCredits(tx, {
        payment,
        product,
        note: product ? `${product.name} purchase (webhook backfill)` : undefined,
        createdBy: options.actorUserId,
      });
      if (credit.inserted) {
        await tx.insert(auditLogsTable).values({
          actorUserId: options.actorUserId ?? undefined,
          action: "payment.credits_backfilled",
          entityType: "payment",
          entityId: payment.id,
          metadata: {
            hours: credit.hours,
            productId: product!.id,
            fulfillmentKey: purchaseCreditFulfillmentKey(payment.id),
            source: "paid_uncredited_backfill",
          },
        });
      }
      return {
        granted: {
          paymentId: payment.id,
          hours: credit.hours,
          productSlug: product?.slug ?? row.productSlug,
          inserted: credit.inserted,
        },
      };
    });

    if ("skipped" in result && result.skipped) {
      skipped.push({ paymentId: row.paymentId, reason: result.skipped });
    } else if ("granted" in result && result.granted) {
      granted.push(result.granted);
    }
  }

  return {
    dryRun,
    scanned: selected.length,
    granted,
    skipped,
  };
}
