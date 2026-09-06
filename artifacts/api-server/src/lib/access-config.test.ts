import test from "node:test";
import assert from "node:assert/strict";
const {
  configuredAccess,
  configuredAccessConflicts,
  normalizeProvisionedEmail,
  verifiedPrimaryEmail,
} =
  // @ts-expect-error Node's strip-types test runner resolves the source extension directly.
  await import("./access-config.ts");

const baseEnv = {
  ACCEPTED_ADMIN_CLERK_USER_IDS: "id-admin",
  ACCEPTED_SAT_TUTOR_CLERK_USER_IDS: "id-sat",
  ACCEPTED_ADMIN_EMAILS: " Admin@AcceptedAdmissions.org ",
  ACCEPTED_SAT_TUTOR_EMAILS: "xavier@example.com",
  ACCEPTED_ENGLISH_TUTOR_EMAILS: "nika@example.com",
  ACCEPTED_TUTOR_EMAILS: "general@example.com",
  ACCEPTED_STUDENT_EMAILS: "student@example.com",
  ACCEPTED_VIEWER_EMAILS: "viewer@example.com",
} satisfies NodeJS.ProcessEnv;

test("normalizes provisioned email addresses", () => {
  assert.equal(
    normalizeProvisionedEmail("  ADMIN@Example.COM "),
    "admin@example.com",
  );
});

test("keeps existing Clerk ID overrides", () => {
  assert.deepEqual(
    configuredAccess("id-admin", "different@example.com", baseEnv),
    {
      access: { role: "administrator", subject: "all" },
      conflict: false,
    },
  );
});

test("maps each provisioned email to its role", () => {
  assert.deepEqual(
    configuredAccess("new-google-id", "ADMIN@acceptedadmissions.org", baseEnv)
      .access,
    {
      role: "administrator",
      subject: "all",
    },
  );
  assert.deepEqual(
    configuredAccess("new-google-id", "xavier@example.com", baseEnv).access,
    {
      role: "tutor",
      subject: "SAT",
    },
  );
  assert.deepEqual(
    configuredAccess("new-google-id", "nika@example.com", baseEnv).access,
    {
      role: "tutor",
      subject: "IELTS",
    },
  );
  assert.deepEqual(
    configuredAccess("new-google-id", "general@example.com", baseEnv).access,
    {
      role: "tutor",
      subject: "all",
    },
  );
  assert.deepEqual(
    configuredAccess("new-google-id", "student@example.com", baseEnv).access,
    {
      role: "student",
      subject: "all",
    },
  );
  assert.deepEqual(
    configuredAccess("new-google-id", "viewer@example.com", baseEnv).access,
    {
      role: "viewer",
      subject: "student:taito0525@gmail.com",
    },
  );
});

test("maps the complete approved roster without overlapping roles", () => {
  const rosterEnv = {
    ACCEPTED_ADMIN_EMAILS: "admin@acceptedadmissions.org",
    ACCEPTED_SAT_TUTOR_EMAILS:
      "xaver.rmz6@gmail.com, eunice_chon@berkeley.edu",
    ACCEPTED_ENGLISH_TUTOR_EMAILS: "nika.raiffe@gmail.com",
    ACCEPTED_TUTOR_EMAILS: "",
    ACCEPTED_STUDENT_EMAILS: "taito0525@gmail.com",
    ACCEPTED_VIEWER_EMAILS: "ryo@jaac.co.jp",
  } satisfies NodeJS.ProcessEnv;
  const expected = [
    ["admin@acceptedadmissions.org", "administrator", "all"],
    ["xaver.rmz6@gmail.com", "tutor", "SAT"],
    ["eunice_chon@berkeley.edu", "tutor", "SAT"],
    ["taito0525@gmail.com", "student", "all"],
    ["nika.raiffe@gmail.com", "tutor", "IELTS"],
    ["ryo@jaac.co.jp", "viewer", "student:taito0525@gmail.com"],
  ] as const;

  for (const [email, role, subject] of expected) {
    assert.deepEqual(configuredAccess(`new-id-${email}`, email, rosterEnv), {
      access: { role, subject },
      conflict: false,
    });
  }
});

test("fails closed when an email is provisioned for conflicting roles", () => {
  const env = {
    ...baseEnv,
    ACCEPTED_ADMIN_EMAILS: "conflict@example.com",
    ACCEPTED_STUDENT_EMAILS: " conflict@example.com ",
  };
  assert.deepEqual(
    configuredAccess("new-google-id", "CONFLICT@example.com", env),
    {
      access: null,
      conflict: true,
    },
  );
});

test("fails closed when a Clerk ID is provisioned for conflicting roles", () => {
  const env = {
    ...baseEnv,
    ACCEPTED_ADMIN_CLERK_USER_IDS: "id-admin,id-conflict",
    ACCEPTED_STUDENT_CLERK_USER_IDS: "id-conflict",
  };
  assert.deepEqual(configuredAccess("id-conflict", undefined, env), {
    access: null,
    conflict: true,
  });
});

test("reports conflicting allowlists without returning the configured identities", () => {
  const conflicts = configuredAccessConflicts({
    ...baseEnv,
    ACCEPTED_ADMIN_EMAILS: "conflict@example.com",
    ACCEPTED_STUDENT_EMAILS: " conflict@example.com ",
    ACCEPTED_ADMIN_CLERK_USER_IDS: "id-admin,id-conflict",
    ACCEPTED_STUDENT_CLERK_USER_IDS: "id-conflict",
  });

  assert.deepEqual(conflicts, [
    { roleCategories: ["administrator", "student"] },
    { roleCategories: ["administrator", "student"] },
  ]);
  assert.doesNotMatch(JSON.stringify(conflicts), /conflict@example\.com|id-conflict/);
});

test("does not treat duplicate entries in one allowlist as conflicts", () => {
  assert.deepEqual(
    configuredAccessConflicts({
      ACCEPTED_ADMIN_EMAILS: "admin@example.com, ADMIN@example.com ",
    }),
    [],
  );
});

test("denies emails that are not provisioned", () => {
  assert.deepEqual(
    configuredAccess("new-google-id", "unknown@example.com", baseEnv),
    {
      access: null,
      conflict: false,
    },
  );
});

test("resolves database grants for tutors and students", async () => {
  const { resolvePortalAccess, databaseConfiguredAccess, mergeAccessDecisions } =
    // @ts-expect-error Node's strip-types test runner resolves the source extension directly.
    await import("./access-config.ts");

  assert.deepEqual(
    databaseConfiguredAccess("clerk-1", "new.student@example.com", [
      {
        email: "new.student@example.com",
        clerkUserId: null,
        roleCategory: "student",
        active: true,
      },
    ]),
    { access: { role: "student", subject: "all" }, conflict: false },
  );

  assert.deepEqual(
    resolvePortalAccess("clerk-sat", "sat.tutor@example.com", {
      env: {},
      databaseGrants: [
        {
          email: "sat.tutor@example.com",
          clerkUserId: "clerk-sat",
          roleCategory: "sat_tutor",
          active: true,
        },
      ],
    }),
    { access: { role: "tutor", subject: "SAT" }, conflict: false },
  );

  assert.deepEqual(
    mergeAccessDecisions(
      { access: { role: "student", subject: "all" }, conflict: false },
      { access: { role: "tutor", subject: "SAT" }, conflict: false },
    ),
    { access: null, conflict: true },
  );
});

test("returns only a Clerk-verified primary email", () => {
  assert.equal(
    verifiedPrimaryEmail({
      primaryEmailAddress: {
        emailAddress: " Admin@AcceptedAdmissions.org ",
        verification: { status: "verified" },
      },
    }),
    "admin@acceptedadmissions.org",
  );
  assert.equal(
    verifiedPrimaryEmail({
      primaryEmailAddress: {
        emailAddress: "admin@acceptedadmissions.org",
        verification: { status: "unverified" },
      },
    }),
    undefined,
  );
  assert.equal(
    verifiedPrimaryEmail({
      primaryEmailAddress: {
        emailAddress: "admin@acceptedadmissions.org",
        verification: null,
      },
    }),
    undefined,
  );
});

test("honors student and tutor database grants without env allowlists", async () => {
  const { resolvePortalAccess } =
    // @ts-expect-error Node's strip-types test runner resolves the source extension directly.
    await import("./access-config.ts");

  assert.deepEqual(
    resolvePortalAccess("user_prod_student", "samapostgrad@gmail.com", {
      env: {},
      databaseGrants: [
        {
          email: "samapostgrad@gmail.com",
          clerkUserId: "user_prod_student",
          roleCategory: "student",
          active: true,
        },
      ],
    }),
    { access: { role: "student", subject: "all" }, conflict: false },
  );
});

test("keeps administrator and viewer env-only even when a student grant exists for someone else", async () => {
  const { resolvePortalAccess } =
    // @ts-expect-error Node's strip-types test runner resolves the source extension directly.
    await import("./access-config.ts");

  const grants = [
    {
      email: "student@example.com",
      clerkUserId: "user_prod_student",
      roleCategory: "student" as const,
      active: true,
    },
  ];

  assert.deepEqual(
    resolvePortalAccess("user_admin_unlisted", "admin@example.com", {
      env: {},
      databaseGrants: grants,
    }),
    { access: null, conflict: false },
  );
  assert.deepEqual(
    resolvePortalAccess("user_viewer_unlisted", "viewer@example.com", {
      env: {},
      databaseGrants: grants,
    }),
    { access: null, conflict: false },
  );
  assert.deepEqual(
    resolvePortalAccess("user_admin_env", "admin@example.com", {
      env: { ACCEPTED_ADMIN_CLERK_USER_IDS: "user_admin_env" },
      databaseGrants: grants,
    }),
    { access: { role: "administrator", subject: "all" }, conflict: false },
  );
  assert.deepEqual(
    resolvePortalAccess("user_viewer_env", "viewer@example.com", {
      env: { ACCEPTED_VIEWER_EMAILS: "viewer@example.com" },
      databaseGrants: grants,
    }),
    {
      access: {
        role: "viewer",
        subject: "student:taito0525@gmail.com",
      },
      conflict: false,
    },
  );
});

test("denies the retired Xavier Clerk id even when it remains on the SAT allowlist", async () => {
  const { resolvePortalAccess } =
    // @ts-expect-error Node's strip-types test runner resolves the source extension.
    await import("./access-config.ts");
  const {
    CANONICAL_XAVIER_CLERK_USER_ID,
    CANONICAL_XAVIER_EMAIL,
    RETIRED_XAVIER_CLERK_USER_ID,
  } =
    // @ts-expect-error Native Node test execution requires the source extension.
    await import("./xavier-identity.ts");

  const env = {
    ACCEPTED_SAT_TUTOR_CLERK_USER_IDS: RETIRED_XAVIER_CLERK_USER_ID,
    ACCEPTED_SAT_TUTOR_EMAILS: "xavier.rmz6@gmail.com, xsfam6@gmail.com",
  };

  assert.deepEqual(
    resolvePortalAccess(RETIRED_XAVIER_CLERK_USER_ID, "xavier.rmz6@gmail.com", {
      env,
      databaseGrants: [
        {
          email: "xavier.rmz6@gmail.com",
          clerkUserId: RETIRED_XAVIER_CLERK_USER_ID,
          roleCategory: "sat_tutor",
          active: true,
        },
      ],
    }),
    { access: null, conflict: false },
  );
  assert.deepEqual(
    resolvePortalAccess(CANONICAL_XAVIER_CLERK_USER_ID, CANONICAL_XAVIER_EMAIL, {
      env: {},
      databaseGrants: [
        {
          email: CANONICAL_XAVIER_EMAIL,
          clerkUserId: CANONICAL_XAVIER_CLERK_USER_ID,
          roleCategory: "sat_tutor",
          active: true,
        },
      ],
    }),
    { access: { role: "tutor", subject: "SAT" }, conflict: false },
  );
});

test("revokes email access when Clerk's current primary email changes", () => {
  const changedPrimaryEmail = verifiedPrimaryEmail({
    primaryEmailAddress: {
      emailAddress: "changed@example.com",
      verification: { status: "verified" },
    },
  });
  assert.deepEqual(
    configuredAccess("new-google-id", changedPrimaryEmail, baseEnv),
    {
      access: null,
      conflict: false,
    },
  );
});
