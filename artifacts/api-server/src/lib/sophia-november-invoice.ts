// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { SOPHIA_SLEIMAN_SAT_USER_ID } from "./sat-tutor-pricing.ts";

export const SOPHIA_NOVEMBER_2026_INVOICE_KEY = "sophia-sleiman-november-2026-sat";
export const SOPHIA_NOVEMBER_2026_PAY_URL =
  "https://wise.com/pay/r/rS6_TjwRk0ff8ho";
export const SOPHIA_NOVEMBER_2026_TOTAL_CENTS = 228_000;
export const SOPHIA_NOVEMBER_2026_DUE_ON = "2026-11-01";

export const SOPHIA_NOVEMBER_2026_COVERAGE = [
  "5 SAT Math sessions with Xavier on Nov 1, 8, 15, 22, and 29",
  "4 SAT English sessions with Eunice on Nov 4, 11, 18, and 25",
  "Each session is 90 minutes, 10:00–11:30 AM ET",
] as const;

export const UNPAID_PORTAL_INVOICE_STATUSES = ["pending", "sent", "overdue"] as const;
export const SETTLED_PORTAL_INVOICE_STATUSES = [
  "paid",
  "partially_paid",
  "refunded",
  "partially_refunded",
] as const;

export type PortalOpenInvoice = {
  id: string;
  title: string;
  coverage: string[];
  totalCents: number;
  dueOn: string;
  status: (typeof UNPAID_PORTAL_INVOICE_STATUSES)[number];
  payUrl: string;
};

export type PortalInvoiceHistoryEntry = {
  id: string;
  purchasedAt: string;
  label: string;
  service: string;
  tutorName: null;
  hours: null;
  sessionTitle: null;
  sessionStart: null;
  amountCents: number;
  status: "paid";
  documentUrl: string | null;
};

export type StoredPortalInvoice = {
  id: string;
  status: string;
  totalCents: number;
  dueAt: Date | string | null;
  paidAt?: Date | string | null;
  hostedInvoiceUrl: string | null;
  receiptUrl: string | null;
  description: string | null;
  lineItems?: Array<{ description?: string }> | null;
};

function dueOnFrom(value: Date | string | null | undefined): string {
  if (!value) return SOPHIA_NOVEMBER_2026_DUE_ON;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return SOPHIA_NOVEMBER_2026_DUE_ON;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function coverageFrom(stored: StoredPortalInvoice | null): string[] {
  const lines = (stored?.lineItems ?? [])
    .map((item) => item.description?.trim() ?? "")
    .filter(Boolean);
  return lines.length > 0 ? lines : [...SOPHIA_NOVEMBER_2026_COVERAGE];
}

export function isSophiaNovemberInvoice(row: {
  hostedInvoiceUrl?: string | null;
  description?: string | null;
}): boolean {
  if (row.hostedInvoiceUrl?.trim() === SOPHIA_NOVEMBER_2026_PAY_URL) return true;
  return (row.description ?? "").includes(SOPHIA_NOVEMBER_2026_INVOICE_KEY);
}

function sophiaStudent(input: { id: string; role: string }, clientUserId: string): boolean {
  return (
    input.role === "student" &&
    input.id === SOPHIA_SLEIMAN_SAT_USER_ID &&
    clientUserId === SOPHIA_SLEIMAN_SAT_USER_ID
  );
}

export function presentSophiaNovemberInvoice(input: {
  requester: { id: string; role: string };
  clientUserId: string;
  stored: StoredPortalInvoice | null;
}):
  | { kind: "unpaid"; invoice: PortalOpenInvoice }
  | { kind: "paid"; history: PortalInvoiceHistoryEntry }
  | { kind: "hidden" } {
  if (!sophiaStudent(input.requester, input.clientUserId)) return { kind: "hidden" };
  const stored = input.stored;
  const status = (stored?.status ?? "sent").trim().toLowerCase();
  if ((SETTLED_PORTAL_INVOICE_STATUSES as readonly string[]).includes(status)) {
    const receipt = stored?.receiptUrl?.trim() || null;
    const documentUrl =
      receipt && receipt !== SOPHIA_NOVEMBER_2026_PAY_URL ? receipt : null;
    const paidAt = stored?.paidAt
      ? new Date(stored.paidAt)
      : new Date(`${SOPHIA_NOVEMBER_2026_DUE_ON}T15:00:00.000Z`);
    return {
      kind: "paid",
      history: {
        id: stored?.id ?? SOPHIA_NOVEMBER_2026_INVOICE_KEY,
        purchasedAt: Number.isNaN(paidAt.getTime())
          ? `${SOPHIA_NOVEMBER_2026_DUE_ON}T15:00:00.000Z`
          : paidAt.toISOString(),
        label: "November 2026 invoice",
        service: "SAT",
        tutorName: null,
        hours: null,
        sessionTitle: null,
        sessionStart: null,
        amountCents: Number(stored?.totalCents) || SOPHIA_NOVEMBER_2026_TOTAL_CENTS,
        status: "paid",
        documentUrl,
      },
    };
  }
  if (
    stored &&
    !(UNPAID_PORTAL_INVOICE_STATUSES as readonly string[]).includes(status) &&
    status !== "sent"
  ) {
    return { kind: "hidden" };
  }
  const payUrl = SOPHIA_NOVEMBER_2026_PAY_URL;
  const unpaidStatus = (UNPAID_PORTAL_INVOICE_STATUSES as readonly string[]).includes(status)
    ? (status as PortalOpenInvoice["status"])
    : "sent";
  return {
    kind: "unpaid",
    invoice: {
      id: stored?.id ?? SOPHIA_NOVEMBER_2026_INVOICE_KEY,
      title: "November 2026 invoice",
      coverage: coverageFrom(stored),
      totalCents: Number(stored?.totalCents) || SOPHIA_NOVEMBER_2026_TOTAL_CENTS,
      dueOn: dueOnFrom(stored?.dueAt),
      status: unpaidStatus,
      payUrl,
    },
  };
}

