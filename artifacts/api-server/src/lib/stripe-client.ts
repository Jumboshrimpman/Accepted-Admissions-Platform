import Stripe from "stripe";

export class StripeRequestError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "StripeRequestError";
    this.status = status;
    this.details = details;
  }
}

type StripeRecord = Record<string, unknown>;

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY for the Accepted Admissions Stripe account.",
    );
  }
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

/** Test helper: clear the singleton so env changes take effect. */
export function resetStripeClientForTests(): void {
  stripeClient = null;
}

function paramsFromBody(body?: URLSearchParams): Record<string, string> | null {
  if (!body) return null;
  const params: Record<string, string> = {};
  for (const [key, value] of body.entries()) {
    params[key] = value;
  }
  return params;
}

function stripeErrorStatus(error: { statusCode?: number } | undefined): number {
  if (typeof error?.statusCode === "number") return error.statusCode;
  return 500;
}

export async function stripeRequest<T extends StripeRecord>(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: URLSearchParams;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const stripe = getStripeClient();
  const method = options.method ?? "GET";
  const requestOptions: Stripe.RawRequestOptions = {};
  if (options.idempotencyKey) {
    requestOptions.idempotencyKey = options.idempotencyKey;
  }
  try {
    const params = method === "POST" ? paramsFromBody(options.body) : null;
    const response = await stripe.rawRequest(method, path, params ?? undefined, requestOptions);
    return (response ?? {}) as T;
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new StripeRequestError(
        error.message || "Stripe request failed",
        stripeErrorStatus(error),
        error.raw ?? { message: error.message },
      );
    }
    throw error;
  }
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
  const requirements =
    account.requirements && typeof account.requirements === "object"
      ? (account.requirements as Record<string, unknown>)
      : {};
  const capabilities =
    account.capabilities && typeof account.capabilities === "object"
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
  constructVerifiedStripeEvent(payload, signature);
}

export function constructVerifiedStripeEvent(
  payload: Buffer,
  signature: string,
): {
  id: string;
  type: string;
  data: { object: StripeRecord };
} {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "Stripe webhook verification is not configured. Set STRIPE_WEBHOOK_SECRET.",
    );
  }
  const event = Stripe.webhooks.constructEvent(payload, signature, secret);
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
    data: { object: event.data.object as unknown as StripeRecord },
  };
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
