import { clerkClient } from "@clerk/express";
// @ts-expect-error Native Node test execution requires the source extension.
import { normalizeProvisionedEmail } from "./access-config.ts";
// @ts-expect-error Native Node test execution requires the source extension.
import {
  CANONICAL_XAVIER_EMAIL,
  isRetiredXavierClerkUserId,
  isRetiredXavierEmail,
} from "./xavier-identity.ts";

export type ProductionClerkUser = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: {
    id?: string;
    emailAddress?: string;
    verification?: { status?: string | null } | null;
  } | null;
  emailAddresses?: Array<{
    id: string;
    emailAddress: string;
    verification?: { status?: string | null } | null;
  }>;
};

export type ProductionClerkUsersClient = {
  getUser(userId: string): Promise<ProductionClerkUser>;
  getUserList(params: {
    emailAddress: string[];
  }): Promise<{ data: ProductionClerkUser[] } | ProductionClerkUser[]>;
  createUser(params: {
    emailAddress: string[];
    firstName?: string;
    lastName?: string;
    skipPasswordRequirement?: boolean;
    skipPasswordChecks?: boolean;
  }): Promise<ProductionClerkUser>;
  updateEmailAddress(
    emailAddressId: string,
    params: { verified: boolean },
  ): Promise<unknown>;
};

export type ResolveProductionClerkUserInput = {
  email: string;
  displayName?: string;
  pastedClerkUserId?: string | null;
};

export type ResolveProductionClerkUserResult = {
  clerkUserId: string;
  created: boolean;
  ignoredPastedClerkUserId: string | null;
  warning: string | null;
};

export class ClerkProductionUserError extends Error {
  code:
    | "CLERK_PRODUCTION_UNAVAILABLE"
    | "CLERK_PRODUCTION_LOOKUP_FAILED"
    | "CLERK_PRODUCTION_CREATE_FAILED";
  httpStatus: number;

  constructor(
    code:
      | "CLERK_PRODUCTION_UNAVAILABLE"
      | "CLERK_PRODUCTION_LOOKUP_FAILED"
      | "CLERK_PRODUCTION_CREATE_FAILED",
    message: string,
    httpStatus = 502,
  ) {
    super(message);
    this.name = "ClerkProductionUserError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const PASTED_ID_MISSING_WARNING =
  "The pasted Clerk user ID was not found in the Production Clerk instance and was replaced with the Production user for this email.";

const PASTED_ID_EMAIL_MISMATCH_WARNING =
  "The pasted Clerk user ID is in Production but belongs to a different email, so it was ignored and replaced with the Production user for this email.";

const RETIRED_XAVIER_PASTED_ID_WARNING =
  "That Clerk user is the retired Xavier duplicate. Production access uses xaver.rmz6@gmail.com / user_3IxUfoT1xRnDsqhlx5NN1eGfRg6.";

let clientOverride: ProductionClerkUsersClient | null = null;

export function setProductionClerkUsersClientForTests(
  client: ProductionClerkUsersClient | null,
): void {
  clientOverride = client;
}

export function looksLikeClerkUserId(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length >= 3 &&
    !trimmed.includes("@") &&
    !trimmed.startsWith("pending:") &&
    !trimmed.startsWith("retired:")
  );
}

export function splitDisplayName(name: string): {
  firstName?: string;
  lastName?: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function defaultProductionClerkUsersClient(): ProductionClerkUsersClient {
  return {
    getUser: (userId) => clerkClient.users.getUser(userId),
    getUserList: (params) => clerkClient.users.getUserList(params),
    createUser: (params) => clerkClient.users.createUser(params),
    updateEmailAddress: (emailAddressId, params) =>
      clerkClient.emailAddresses.updateEmailAddress(emailAddressId, params),
  };
}

function getClient(): ProductionClerkUsersClient {
  return clientOverride ?? defaultProductionClerkUsersClient();
}

export function isClerkNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status =
    "status" in error ? Number((error as { status?: unknown }).status) : NaN;
  const errors =
    "errors" in error
      ? (error as { errors?: Array<{ code?: string }> }).errors
      : undefined;
  return (
    status === 404 ||
    Boolean(errors?.some((item) => item.code === "resource_not_found"))
  );
}

function emailsOnUser(user: ProductionClerkUser): string[] {
  return [
    user.primaryEmailAddress?.emailAddress,
    ...(user.emailAddresses ?? []).map((address) => address.emailAddress),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeProvisionedEmail(value));
}

function userHasEmail(user: ProductionClerkUser, email: string): boolean {
  return emailsOnUser(user).includes(email);
}

function listUsers(
  result: { data: ProductionClerkUser[] } | ProductionClerkUser[],
): ProductionClerkUser[] {
  return Array.isArray(result) ? result : (result.data ?? []);
}

async function ensureEmailVerified(
  client: ProductionClerkUsersClient,
  user: ProductionClerkUser,
  email: string,
): Promise<void> {
  const addresses = [
    user.primaryEmailAddress,
    ...(user.emailAddresses ?? []),
  ].filter(
    (
      address,
    ): address is {
      id: string;
      emailAddress: string;
      verification?: { status?: string | null } | null;
    } =>
      Boolean(
        address?.id &&
          address.emailAddress &&
          normalizeProvisionedEmail(address.emailAddress) === email,
      ),
  );
  const seen = new Set<string>();
  for (const address of addresses) {
    if (seen.has(address.id)) continue;
    seen.add(address.id);
    if (address.verification?.status === "verified") continue;
    try {
      await client.updateEmailAddress(address.id, { verified: true });
    } catch {
      // Admin verification is best-effort when the Clerk API allows it.
    }
  }
}

async function findUserByEmail(
  client: ProductionClerkUsersClient,
  email: string,
): Promise<ProductionClerkUser | undefined> {
  try {
    const users = listUsers(await client.getUserList({ emailAddress: [email] }));
    return users.find((user) => userHasEmail(user, email)) ?? users[0];
  } catch {
    throw new ClerkProductionUserError(
      "CLERK_PRODUCTION_LOOKUP_FAILED",
      "Production Clerk could not look up this email. Portal access was not saved.",
      502,
    );
  }
}

async function createVerifiedUser(
  client: ProductionClerkUsersClient,
  email: string,
  displayName?: string,
): Promise<ProductionClerkUser> {
  const names = splitDisplayName(displayName ?? "");
  try {
    const created = await client.createUser({
      emailAddress: [email],
      ...names,
      skipPasswordRequirement: true,
      skipPasswordChecks: true,
    });
    await ensureEmailVerified(client, created, email);
    return created;
  } catch (error) {
    if (error instanceof ClerkProductionUserError) throw error;
    const existing = await findUserByEmail(client, email);
    if (existing) {
      await ensureEmailVerified(client, existing, email);
      return existing;
    }
    throw new ClerkProductionUserError(
      "CLERK_PRODUCTION_CREATE_FAILED",
      "Production Clerk could not create this user. Portal access was not saved.",
      502,
    );
  }
}

export async function getProductionClerkUser(
  userId: string,
  client: ProductionClerkUsersClient = getClient(),
): Promise<ProductionClerkUser> {
  return client.getUser(userId);
}

export async function resolveProductionClerkUser(
  input: ResolveProductionClerkUserInput,
  client: ProductionClerkUsersClient = getClient(),
): Promise<ResolveProductionClerkUserResult> {
  const email = normalizeProvisionedEmail(input.email);
  if (!email.includes("@")) {
    throw new ClerkProductionUserError(
      "CLERK_PRODUCTION_LOOKUP_FAILED",
      "A valid email address is required to resolve a Production Clerk user.",
      400,
    );
  }

  if (isRetiredXavierEmail(email)) {
    throw new ClerkProductionUserError(
      "CLERK_PRODUCTION_LOOKUP_FAILED",
      `Xavier Morales must be provisioned as ${CANONICAL_XAVIER_EMAIL} (not ${email}). The misspelled / outdated address is retired.`,
      400,
    );
  }

  const pasted = input.pastedClerkUserId?.trim() || null;
  let ignoredPastedClerkUserId: string | null = null;
  let warning: string | null = null;

  if (pasted && isRetiredXavierClerkUserId(pasted)) {
    ignoredPastedClerkUserId = pasted;
    warning = RETIRED_XAVIER_PASTED_ID_WARNING;
  } else if (pasted && looksLikeClerkUserId(pasted)) {
    try {
      const existing = await client.getUser(pasted);
      if (userHasEmail(existing, email)) {
        await ensureEmailVerified(client, existing, email);
        return {
          clerkUserId: existing.id,
          created: false,
          ignoredPastedClerkUserId: null,
          warning: null,
        };
      }
      ignoredPastedClerkUserId = pasted;
      warning = PASTED_ID_EMAIL_MISMATCH_WARNING;
    } catch (error) {
      if (!isClerkNotFoundError(error)) {
        throw new ClerkProductionUserError(
          "CLERK_PRODUCTION_LOOKUP_FAILED",
          "Production Clerk could not verify the pasted user ID. Portal access was not saved.",
          502,
        );
      }
      ignoredPastedClerkUserId = pasted;
      warning = PASTED_ID_MISSING_WARNING;
    }
  }

  const found = await findUserByEmail(client, email);
  if (found) {
    await ensureEmailVerified(client, found, email);
    return {
      clerkUserId: found.id,
      created: false,
      ignoredPastedClerkUserId,
      warning,
    };
  }

  const created = await createVerifiedUser(client, email, input.displayName);
  return {
    clerkUserId: created.id,
    created: true,
    ignoredPastedClerkUserId,
    warning,
  };
}
