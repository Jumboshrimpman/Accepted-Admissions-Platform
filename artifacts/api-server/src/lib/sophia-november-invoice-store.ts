import { eq } from "drizzle-orm";
import { db, invoicesTable } from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  isSophiaNovemberInvoice,
  type StoredPortalInvoice,
} from "./sophia-november-invoice.ts";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";

export async function loadSophiaNovemberInvoice(
  clientUserId: string,
): Promise<StoredPortalInvoice | null> {
  if (clientUserId !== SOPHIA_SLEIMAN_SAT_USER_ID) return null;
  const rows = await db
    .select({
      id: invoicesTable.id,
      status: invoicesTable.status,
      totalCents: invoicesTable.totalCents,
      dueAt: invoicesTable.dueAt,
      paidAt: invoicesTable.paidAt,
      hostedInvoiceUrl: invoicesTable.hostedInvoiceUrl,
      receiptUrl: invoicesTable.receiptUrl,
      description: invoicesTable.description,
      lineItems: invoicesTable.lineItems,
    })
    .from(invoicesTable)
    .where(eq(invoicesTable.clientUserId, clientUserId));
  return rows.find((row) => isSophiaNovemberInvoice(row)) ?? null;
}
