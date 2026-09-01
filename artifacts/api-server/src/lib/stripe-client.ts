import { ReplitConnectors } from "@replit/connectors-sdk";
import { createHmac, timingSafeEqual } from "node:crypto";

const connectors = new ReplitConnectors();

export class StripeRequestError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(
    message: string,
    status: number,
    details: unknown,
  ) {
    super(message);
    this.name = "StripeRequestError";
    this.status = status;
    this.details = details;
  }
}

type StripeRecord = Record<string, unknown>;

export async function stripeRequest<T extends StripeRecord>(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: URLSearchParams;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  const response = await connectors.proxy("stripe", path, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
  const raw = await response.text();
  let details: unknown = null;
  try {
    details = raw ? JSON.parse(raw) : null;
  } catch {
    details = raw;
  }
  if (!response.ok) {
    const message =
      details && typeof details === "object"
        ? String((details as StripeRecord).error &&
            typeof (details as StripeRecord).error === "object"
          ? ((details as StripeRecord).error as StripeRecord).message
          : "Stripe request failed")
        : "Stripe request failed";
    throw new StripeRequestError(message, response.status, details);
  }
  return (details ?? {}) as T;
}

export function formData(
  fields: Record<string, string | number | boolean | null | undefined>,
): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  return body;
}

export async function createStripeConnectAccount(args: {
  tutorProfileId: string;
  name: string;
  email: string;
}): Promise<{ id: string }> {
  const account = await stripeRequest<Record<string, unknown>>("/v1/accounts", {
    method: "POST",
    idempotencyKey: `accepted-admissions-connect-account-${args.tutorProfileId}`,
    body: formData({
      type: "express",
      country: "US",
      email: args.email,
      "capabilities[transfers][requested]": true,
      "business_profile[name]": args.name,
      "metadata[tutor_profile_id]": args.tutorProfileId,
    }),
  });
  const id = typeof account.id === "string" ? account.id : "";
  if (!id) throw new Error("Stripe did not return a connected account id");
  return { id };
}

export async function createStripeConnectAccountLink(args: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<string> {
  const link = await stripeRequest<Record<string, unknown>>("/v1/account_links", {
    method: "POST",
    idempotencyKey: `accepted-admissions-connect-onboarding-${args.accountId}-${Date.now()}`,
    body: formData({
      account: args.accountId,
      refresh_url: args.refreshUrl,
      return_url: args.returnUrl,
      type: "account_onboarding",
    }),
  });
  const url = typeof link.url === "string" ? link.url : "";
  if (!url) throw new Error("Stripe did not return a connected account onboarding URL");
  return url;
}

export type StripeConnectAccountStatus = {
  id: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  transfersCapability: string;
  requirementsCurrentlyDue: string[];
};

export async function retrieveStripeConnectAccount(
  accountId: string,
): Promise<StripeConnectAccountStatus> {
  const account = await stripeRequest<Record<string, unknown>>(`/v1/accounts/${accountId}`);
  const requirements = account.requirements && typeof account.requirements === "object"
    ? (account.requirements as Record<string, unknown>)
    : {};
  const capabilities = account.capabilities && typeof account.capabilities === "object"
    ? (account.capabilities as Record<string, unknown>)
    : {};
  return {
    id: accountId,
    detailsSubmitted: account.details_submitted === true,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    transfersCapability:
      typeof capabilities.transfers === "string" ? capabilities.transfers : "inactive",
    requirementsCurrentlyDue: Array.isArray(requirements.currently_due)
      ? requirements.currently_due.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function verifyStripeSignature(payload: Buffer, signature: string): void {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "Stripe webhook verification is not configured. Set STRIPE_WEBHOOK_SECRET in Replit Secrets.",
    );
  }
  const parts = signature.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const receivedSignatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value));
  if (!timestamp || receivedSignatures.length === 0 || !/^\d+$/.test(timestamp)) {
    throw new Error("Invalid Stripe signature");
  }
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new Error("Expired Stripe signature");
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const valid = receivedSignatures.some((received) => {
    const receivedBuffer = Buffer.from(received, "utf8");
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  });
  if (!valid) {
    throw new Error("Invalid Stripe signature");
  }
}

export function webhookEventFromPayload(payload: Buffer): {
  id: string;
  type: string;
  data: { object: StripeRecord };
} {
  const event = JSON.parse(payload.toString("utf8")) as {
    id?: unknown;
    type?: unknown;
    data?: { object?: unknown };
  };
  if (
    typeof event.id !== "string" ||
    typeof event.type !== "string" ||
    !event.data ||
    !event.data.object ||
    typeof event.data.object !== "object"
  ) {
    throw new Error("Invalid Stripe event payload");
  }
  return {
    id: event.id,
    type: event.type,
    data: { object: event.data.object as StripeRecord },
  };
}