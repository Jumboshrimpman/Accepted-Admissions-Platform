import test from "node:test";
import assert from "node:assert/strict";

const {
  ClerkProductionUserError,
  looksLikeClerkUserId,
  resolveProductionClerkUser,
  splitDisplayName,
} =
  // @ts-expect-error Node's strip-types test runner resolves the source extension directly.
  await import("./clerk-production-users.ts");

type MockUser = {
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

function notFoundError() {
  return Object.assign(new Error("not found"), {
    status: 404,
    errors: [{ code: "resource_not_found" }],
  });
}

function createMockClient(options: {
  usersById?: Record<string, MockUser>;
  usersByEmail?: Record<string, MockUser>;
  createdId?: string;
}) {
  const calls = {
    getUser: [] as string[],
    getUserList: [] as string[][],
    createUser: [] as Array<Record<string, unknown>>,
    updateEmailAddress: [] as Array<{ id: string; verified: boolean }>,
    invitations: [] as unknown[],
  };
  const usersById = { ...(options.usersById ?? {}) };
  const usersByEmail = { ...(options.usersByEmail ?? {}) };

  return {
    calls,
    client: {
      async getUser(userId: string) {
        calls.getUser.push(userId);
        const user = usersById[userId];
        if (!user) throw notFoundError();
        return user;
      },
      async getUserList(params: { emailAddress: string[] }) {
        calls.getUserList.push(params.emailAddress);
        const matches = params.emailAddress
          .map((email) => usersByEmail[email.toLowerCase()])
          .filter((user): user is MockUser => Boolean(user));
        return { data: matches };
      },
      async createUser(params: {
        emailAddress: string[];
        firstName?: string;
        lastName?: string;
        skipPasswordRequirement?: boolean;
        skipPasswordChecks?: boolean;
      }) {
        calls.createUser.push(params);
        const email = params.emailAddress[0]!;
        const created: MockUser = {
          id: options.createdId ?? "user_prod_created",
          firstName: params.firstName,
          lastName: params.lastName,
          primaryEmailAddress: {
            id: "idn_created",
            emailAddress: email,
            verification: { status: "unverified" },
          },
          emailAddresses: [
            {
              id: "idn_created",
              emailAddress: email,
              verification: { status: "unverified" },
            },
          ],
        };
        usersById[created.id] = created;
        usersByEmail[email.toLowerCase()] = created;
        return created;
      },
      async updateEmailAddress(
        emailAddressId: string,
        params: { verified: boolean },
      ) {
        calls.updateEmailAddress.push({
          id: emailAddressId,
          verified: params.verified,
        });
        return {};
      },
    },
  };
}

test("splits display names for Clerk createUser", () => {
  assert.deepEqual(splitDisplayName("Sama Noori"), {
    firstName: "Sama",
    lastName: "Noori",
  });
  assert.deepEqual(splitDisplayName("Sama"), { firstName: "Sama" });
});

test("rejects pending placeholders as Clerk user IDs", () => {
  assert.equal(looksLikeClerkUserId("user_abc"), true);
  assert.equal(looksLikeClerkUserId("pending:sama@example.com"), false);
  assert.equal(looksLikeClerkUserId("sama@example.com"), false);
});

test("creates a Production Clerk user when the email is missing and never invites", async () => {
  const mock = createMockClient({ createdId: "user_prod_sama" });
  const result = await resolveProductionClerkUser(
    {
      email: " SamaPostgrad@gmail.com ",
      displayName: "Sama Noori",
    },
    mock.client,
  );

  assert.deepEqual(result, {
    clerkUserId: "user_prod_sama",
    created: true,
    ignoredPastedClerkUserId: null,
    warning: null,
  });
  assert.equal(mock.calls.createUser.length, 1);
  assert.deepEqual(mock.calls.createUser[0], {
    emailAddress: ["samapostgrad@gmail.com"],
    firstName: "Sama",
    lastName: "Noori",
    skipPasswordRequirement: true,
    skipPasswordChecks: true,
  });
  assert.deepEqual(mock.calls.updateEmailAddress, [
    { id: "idn_created", verified: true },
  ]);
  assert.equal(mock.calls.invitations.length, 0);
  assert.equal("invitations" in mock.client, false);
});

test("replaces a pasted foreign Clerk ID that is not in Production", async () => {
  const mock = createMockClient({ createdId: "user_prod_replaced" });
  const result = await resolveProductionClerkUser(
    {
      email: "student@example.com",
      displayName: "New Student",
      pastedClerkUserId: "user_dev_foreign",
    },
    mock.client,
  );

  assert.equal(result.clerkUserId, "user_prod_replaced");
  assert.equal(result.created, true);
  assert.equal(result.ignoredPastedClerkUserId, "user_dev_foreign");
  assert.match(result.warning ?? "", /not found in the Production Clerk instance/);
  assert.deepEqual(mock.calls.getUser, ["user_dev_foreign"]);
  assert.equal(mock.calls.createUser.length, 1);
  assert.equal(mock.calls.invitations.length, 0);
});

test("uses an existing Production user found by email without creating or inviting", async () => {
  const existing = {
    id: "user_prod_existing",
    primaryEmailAddress: {
      id: "idn_existing",
      emailAddress: "tutor@example.com",
      verification: { status: "unverified" },
    },
    emailAddresses: [
      {
        id: "idn_existing",
        emailAddress: "tutor@example.com",
        verification: { status: "unverified" },
      },
    ],
  };
  const mock = createMockClient({
    usersByEmail: { "tutor@example.com": existing },
    usersById: { [existing.id]: existing },
  });

  const result = await resolveProductionClerkUser(
    { email: "tutor@example.com", pastedClerkUserId: "user_dev_foreign" },
    mock.client,
  );

  assert.deepEqual(result, {
    clerkUserId: "user_prod_existing",
    created: false,
    ignoredPastedClerkUserId: "user_dev_foreign",
    warning:
      "The pasted Clerk user ID was not found in the Production Clerk instance and was replaced with the Production user for this email.",
  });
  assert.equal(mock.calls.createUser.length, 0);
  assert.deepEqual(mock.calls.updateEmailAddress, [
    { id: "idn_existing", verified: true },
  ]);
});

test("keeps a pasted Production Clerk ID when the email matches", async () => {
  const existing = {
    id: "user_prod_keep",
    primaryEmailAddress: {
      id: "idn_keep",
      emailAddress: "keep@example.com",
      verification: { status: "verified" },
    },
    emailAddresses: [
      {
        id: "idn_keep",
        emailAddress: "keep@example.com",
        verification: { status: "verified" },
      },
    ],
  };
  const mock = createMockClient({
    usersById: { [existing.id]: existing },
  });

  const result = await resolveProductionClerkUser(
    {
      email: "keep@example.com",
      pastedClerkUserId: "user_prod_keep",
    },
    mock.client,
  );

  assert.deepEqual(result, {
    clerkUserId: "user_prod_keep",
    created: false,
    ignoredPastedClerkUserId: null,
    warning: null,
  });
  assert.equal(mock.calls.createUser.length, 0);
  assert.equal(mock.calls.getUserList.length, 0);
});

test("ignores a pasted Production Clerk ID that belongs to another email", async () => {
  const other = {
    id: "user_prod_other",
    primaryEmailAddress: {
      id: "idn_other",
      emailAddress: "other@example.com",
      verification: { status: "verified" },
    },
    emailAddresses: [
      {
        id: "idn_other",
        emailAddress: "other@example.com",
        verification: { status: "verified" },
      },
    ],
  };
  const mock = createMockClient({
    usersById: { [other.id]: other },
    createdId: "user_prod_for_email",
  });

  const result = await resolveProductionClerkUser(
    {
      email: "intended@example.com",
      displayName: "Intended Student",
      pastedClerkUserId: "user_prod_other",
    },
    mock.client,
  );

  assert.equal(result.clerkUserId, "user_prod_for_email");
  assert.equal(result.ignoredPastedClerkUserId, "user_prod_other");
  assert.match(result.warning ?? "", /different email/);
  assert.equal(mock.calls.createUser.length, 1);
});

test("fails closed when Production Clerk lookup is unavailable", async () => {
  await assert.rejects(
    () =>
      resolveProductionClerkUser(
        { email: "student@example.com" },
        {
          async getUser() {
            throw new Error("network");
          },
          async getUserList() {
            throw new Error("network");
          },
          async createUser() {
            throw new Error("should not create after lookup failure");
          },
          async updateEmailAddress() {
            return {};
          },
        },
      ),
    (error: unknown) =>
      error instanceof ClerkProductionUserError &&
      error.code === "CLERK_PRODUCTION_LOOKUP_FAILED",
  );
});
