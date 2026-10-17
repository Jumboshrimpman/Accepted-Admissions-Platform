import { and, eq, isNull, sql } from "drizzle-orm";
import {
  bookingSlotHoldsTable,
  db,
  sessionsTable,
} from "@workspace/db";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { acquireSharedMeetLock, assertNoSharedMeetConflict } from "./booking-service.ts";

/**
 * Stripe Checkout rejects expires_at sooner than 30 minutes. One extra minute
 * keeps the hold and the Checkout session on the same timestamp.
 */
export const BOOKING_SLOT_HOLD_SECONDS = 31 * 60;

export const SLOT_HELD_MESSAGE =
  "That time is being checked out. Choose another slot.";

type Query = typeof db;
type Tx = Parameters<Parameters<Query["transaction"]>[0]>[0];
type DbOrTx = Query | Tx;

export class SlotHoldConflict extends Error {
  readonly status = 409;
  readonly code = "SLOT_HELD";

  constructor(message = SLOT_HELD_MESSAGE) {
    super(message);
    this.name = "SlotHoldConflict";
  }
}

export function checkoutHoldExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + BOOKING_SLOT_HOLD_SECONDS * 1000);
}

export function checkoutHoldExpiresAtUnix(expiresAt: Date): number {
  return Math.floor(expiresAt.getTime() / 1000);
}

export async function acquireTutorSlotLock(tx: Tx, tutorProfileId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`booking-slot:${tutorProfileId}`}))`,
  );
}

export async function releaseExpiredSlotHolds(
  query: DbOrTx,
  tutorProfileId?: string,
): Promise<void> {
  await query
    .update(bookingSlotHoldsTable)
    .set({ releasedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        isNull(bookingSlotHoldsTable.releasedAt),
        sql`${bookingSlotHoldsTable.expiresAt} <= now()`,
        tutorProfileId
          ? eq(bookingSlotHoldsTable.tutorProfileId, tutorProfileId)
          : sql`true`,
      ),
    );
}

export async function releaseSlotHoldForPayment(
  query: DbOrTx,
  paymentId: string,
): Promise<boolean> {
  const released = await query
    .update(bookingSlotHoldsTable)
    .set({ releasedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(bookingSlotHoldsTable.paymentId, paymentId),
        isNull(bookingSlotHoldsTable.releasedAt),
      ),
    )
    .returning({ id: bookingSlotHoldsTable.id });
  return released.length > 0;
}

function isUniqueViolation(error: unknown): boolean {
  const current = error as { code?: string; cause?: { code?: string } };
  return current.code === "23505" || current.cause?.code === "23505";
}

export async function activeSlotHoldsOverlapping(
  query: DbOrTx,
  args: {
    tutorProfileId: string;
    start: Date;
    end: Date;
    ignorePaymentId?: string;
  },
) {
  return query
    .select({
      id: bookingSlotHoldsTable.id,
      paymentId: bookingSlotHoldsTable.paymentId,
      clientUserId: bookingSlotHoldsTable.clientUserId,
      startTime: bookingSlotHoldsTable.startTime,
      durationMinutes: bookingSlotHoldsTable.durationMinutes,
      expiresAt: bookingSlotHoldsTable.expiresAt,
    })
    .from(bookingSlotHoldsTable)
    .where(
      and(
        eq(bookingSlotHoldsTable.tutorProfileId, args.tutorProfileId),
        isNull(bookingSlotHoldsTable.releasedAt),
        sql`${bookingSlotHoldsTable.expiresAt} > now()`,
        sql`${bookingSlotHoldsTable.startTime} < ${args.end}`,
        sql`${bookingSlotHoldsTable.startTime} + (${bookingSlotHoldsTable.durationMinutes} * interval '1 minute') > ${args.start}`,
        args.ignorePaymentId
          ? sql`${bookingSlotHoldsTable.paymentId} <> ${args.ignorePaymentId}`
          : sql`true`,
      ),
    );
}

async function sessionOverlapsTutor(
  tx: Tx,
  args: { tutorUserId: string | null; start: Date; end: Date },
): Promise<boolean> {
  if (!args.tutorUserId) return false;
  const [row] = await tx
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.tutorUserId, args.tutorUserId),
        sql`${sessionsTable.status} <> 'archived'`,
        sql`${sessionsTable.bookingStatus} <> 'cancelled'`,
        sql`${sessionsTable.dateTime} < ${args.end}`,
        sql`${sessionsTable.dateTime} + (${sessionsTable.durationMinutes} * interval '1 minute') > ${args.start}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function claimBookingSlotHold(
  tx: Tx,
  args: {
    tutorProfileId: string;
    tutorUserId: string | null;
    clientUserId: string;
    paymentId: string;
    start: Date;
    durationMinutes: number;
    expiresAt: Date;
  },
): Promise<void> {
  await acquireTutorSlotLock(tx, args.tutorProfileId);
  await releaseExpiredSlotHolds(tx, args.tutorProfileId);
  await acquireSharedMeetLock(tx);
  const end = new Date(args.start.getTime() + args.durationMinutes * 60_000);
  const [held, sessionTaken] = await Promise.all([
    activeSlotHoldsOverlapping(tx, {
      tutorProfileId: args.tutorProfileId,
      start: args.start,
      end,
    }),
    sessionOverlapsTutor(tx, {
      tutorUserId: args.tutorUserId,
      start: args.start,
      end,
    }),
  ]);
  if (held.length > 0 || sessionTaken) throw new SlotHoldConflict();
  await assertNoSharedMeetConflict(tx, {
    start: args.start,
    end,
    ignoreHoldPaymentId: args.paymentId,
  });
  try {
    await tx.insert(bookingSlotHoldsTable).values({
      tutorProfileId: args.tutorProfileId,
      clientUserId: args.clientUserId,
      paymentId: args.paymentId,
      startTime: args.start,
      durationMinutes: args.durationMinutes,
      expiresAt: args.expiresAt,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new SlotHoldConflict();
    throw error;
  }
}

export async function assertSlotNotHeld(
  tx: Tx,
  args: {
    tutorProfileId: string;
    start: Date;
    end: Date;
    ignorePaymentId?: string;
  },
): Promise<void> {
  await acquireTutorSlotLock(tx, args.tutorProfileId);
  await releaseExpiredSlotHolds(tx, args.tutorProfileId);
  const held = await activeSlotHoldsOverlapping(tx, args);
  if (held.length > 0) throw new SlotHoldConflict();
}

export async function holdIsActiveForPayment(paymentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bookingSlotHoldsTable.id })
    .from(bookingSlotHoldsTable)
    .where(
      and(
        eq(bookingSlotHoldsTable.paymentId, paymentId),
        isNull(bookingSlotHoldsTable.releasedAt),
        sql`${bookingSlotHoldsTable.expiresAt} > now()`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

type HeldCheckoutBooker = (paymentId: string) => Promise<void>;
let heldCheckoutBooker: HeldCheckoutBooker | null = null;

export function setHeldCheckoutBooker(booker: HeldCheckoutBooker): void {
  heldCheckoutBooker = booker;
}

/**
 * Books only while the checkout hold is still active. An expired hold is left
 * for the client return path, which keeps the hours if the slot was taken.
 */
export async function bookHeldCheckoutIfActive(paymentId: string): Promise<void> {
  if (!heldCheckoutBooker) return;
  if (!(await holdIsActiveForPayment(paymentId))) return;
  await heldCheckoutBooker(paymentId);
}
