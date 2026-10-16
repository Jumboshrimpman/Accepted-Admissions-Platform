import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NEEL_DHARNI_USER_ID, VICTORIA_USER_ID } from "./college-consulting.ts";
import {
  LOGIN_ALIAS_FAILURE,
  REFUSED_LOGIN_ALIAS_EMAILS,
  SOPHIA_SLEIMAN_USER_ID,
  aliasLoginAccessOutcome,
  decideStoredClerkAlias,
  decideVerifiedLoginAlias,
  isRefusedLoginAliasEmail,
  loginAliasSelectRows,
  planPortalLoginAliasRollback,
  planPortalLoginAliases,
  portalLoginAliasMappings,
  previewAliasesAfterPlan,
  type LoginAliasRowSnapshot,
  type LoginAliasUserSnapshot,
} from "./portal-login-aliases.ts";

const neel: LoginAliasUserSnapshot = {
  id: NEEL_DHARNI_USER_ID,
  email: "neel.dharni@example.com",
  displayName: "Neel Dharni",
  role: "student",
  clerkUserId: "pending:neel.dharni@example.com",
};

const victoria: LoginAliasUserSnapshot = {
  id: VICTORIA_USER_ID,
  email: "victoriawije7@gmail.com",
  displayName: "Victoria Wijerathnayapa",
  role: "tutor",
  clerkUserId: "pending:victoriawije7@gmail.com",
};

const sophia: LoginAliasUserSnapshot = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "sophia.sleiman@example.com",
  displayName: "Sophia Sleiman",
  role: "student",
  clerkUserId: "user_sophia",
};

const samaPostgrad: LoginAliasUserSnapshot = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "samapostgrad@gmail.com",
  displayName: "Sama Test",
  role: "student",
  clerkUserId: "user_sama_postgrad",
};

const users = [neel, victoria, sophia, samaPostgrad];
const sophiaMappings = portalLoginAliasMappings(sophia.id);

test("login failure is the unprovisioned portal session, not a renamed account", () => {
  assert.equal(LOGIN_ALIAS_FAILURE.clerkMessage, "Couldn't find your account.");
  assert.equal(LOGIN_ALIAS_FAILURE.portalCode, "IDENTITY_NOT_PROVISIONED");
  assert.match(LOGIN_ALIAS_FAILURE.shellCopy, /not on the portal access list/);
});

test("plans the three logins and leaves contact email, role, and name alone", () => {
  const plan = planPortalLoginAliases({
    users,
    aliases: [],
    mappings: sophiaMappings,
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(
    plan.actions.map((action) => action.email),
    ["samakubba@gmail.com", "samakubba@icloud.com", "kubbasama@gmail.com"],
  );
  const sophiaAction = plan.actions.find((action) => action.email === "kubbasama@gmail.com");
  assert.equal(sophiaAction?.userId, sophia.id);
  assert.equal(sophiaAction?.contactEmail, "sophia.sleiman@example.com");
  assert.equal(sophiaAction?.displayName, "Sophia Sleiman");
  assert.equal(sophiaAction?.role, "student");
  assert.equal(sophiaAction?.operation, "insert");
  const neelAction = plan.actions.find((action) => action.email === "samakubba@gmail.com");
  assert.equal(neelAction?.userId, NEEL_DHARNI_USER_ID);
  assert.equal(neelAction?.contactEmail, "neel.dharni@example.com");
  assert.equal(
    plan.actions.some((action) => action.email === "samapostgrad@gmail.com"),
    false,
  );
  assert.equal(
    plan.actions.some((action) => action.email === "xsfam6@gmail.com"),
    false,
  );
});

test("is idempotent when the alias already points at the same user", () => {
  const aliases: LoginAliasRowSnapshot[] = sophiaMappings.map((mapping) => ({
    email: mapping.email,
    userId: mapping.match.userId,
    clerkUserId: null,
    revokedAt: null,
  }));
  const plan = planPortalLoginAliases({ users, aliases, mappings: sophiaMappings });
  assert.equal(plan.ok, true);
  assert.deepEqual(
    plan.actions.map((action) => action.operation),
    ["noop", "noop", "noop"],
  );
});

test("refuses a different user, a missing Sophia, and the blocked addresses", () => {
  const conflict = planPortalLoginAliases({
    users,
    aliases: [
      {
        email: "samakubba@gmail.com",
        userId: sophia.id,
        clerkUserId: null,
        revokedAt: null,
      },
    ],
  });
  assert.equal(conflict.ok, false);
  assert.match(conflict.blocked.join("\n"), /already points at/);

  const missing = planPortalLoginAliases({
    users: [neel, victoria, samaPostgrad],
    aliases: [],
  });
  assert.equal(missing.ok, false);
  assert.match(missing.blocked.join("\n"), /Sophia Sleiman/);
  assert.equal(
    missing.actions.some((action) => action.email === "samakubba@gmail.com"),
    true,
  );

  const refused = planPortalLoginAliases({
    users,
    aliases: [],
    mappings: [
      {
        email: "xsfam6@gmail.com",
        label: "do not map",
        match: { kind: "userId", userId: NEEL_DHARNI_USER_ID, role: "student" },
      },
      {
        email: "samapostgrad@gmail.com",
        label: "do not touch",
        match: { kind: "userId", userId: samaPostgrad.id, role: "student" },
      },
    ],
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.actions.length, 0);
  assert.equal(isRefusedLoginAliasEmail("XSFAM6@gmail.com"), true);
  assert.deepEqual(
    [...REFUSED_LOGIN_ALIAS_EMAILS],
    ["xsfam6@gmail.com", "samapostgrad@gmail.com"],
  );
});

test("does not re-role Victoria or rename Sophia when the stored role is wrong", () => {
  const plan = planPortalLoginAliases({
    users: [{ ...victoria, role: "student" }, neel, sophia],
    aliases: [],
    mappings: sophiaMappings,
  });
  assert.equal(plan.ok, false);
  assert.match(plan.blocked.join("\n"), /will not re-role/);
});

test("rollback removes only the three mapped alias emails", () => {
  const aliases: LoginAliasRowSnapshot[] = [
    {
      email: "samakubba@gmail.com",
      userId: neel.id,
      clerkUserId: "user_neel_login",
      revokedAt: null,
    },
    {
      email: "kubbasama@gmail.com",
      userId: sophia.id,
      clerkUserId: null,
      revokedAt: null,
    },
    {
      email: "someoneelse@example.com",
      userId: sophia.id,
      clerkUserId: null,
      revokedAt: null,
    },
  ];
  assert.deepEqual(planPortalLoginAliasRollback(aliases).emails, [
    "samakubba@gmail.com",
    "kubbasama@gmail.com",
  ]);
});

test("verified alias use stores the clerk id on the alias and not by rewriting the user", () => {
  const decision = decideVerifiedLoginAlias({
    email: "kubbasama@gmail.com",
    clerkUserId: "user_kubba",
    alias: {
      email: "kubbasama@gmail.com",
      userId: sophia.id,
      clerkUserId: null,
      revokedAt: null,
    },
    user: sophia,
  });
  assert.equal(decision.action, "use");
  if (decision.action === "use") {
    assert.equal(decision.userId, sophia.id);
    assert.equal(decision.storeClerkUserId, true);
  }
  assert.equal(
    decideVerifiedLoginAlias({
      email: "xsfam6@gmail.com",
      clerkUserId: "user_x",
      alias: {
        email: "xsfam6@gmail.com",
        userId: neel.id,
        clerkUserId: null,
        revokedAt: null,
      },
      user: neel,
    }).action,
    "refuse",
  );
  assert.equal(
    decideVerifiedLoginAlias({
      email: "samapostgrad@gmail.com",
      clerkUserId: "user_sama_postgrad",
      alias: null,
      user: samaPostgrad,
    }).action,
    "refuse",
  );
  const stored = decideStoredClerkAlias({
    clerkUserId: "user_kubba",
    alias: {
      email: "kubbasama@gmail.com",
      userId: sophia.id,
      clerkUserId: "user_kubba",
      revokedAt: null,
    },
    user: sophia,
  });
  assert.equal(stored.action, "use");
  if (stored.action === "use") assert.equal(stored.storeClerkUserId, false);
});

test("dry-run preview and SELECT keep Sophia's contact email", () => {
  const plan = planPortalLoginAliases({
    users,
    aliases: [],
    mappings: sophiaMappings,
  });
  const preview = previewAliasesAfterPlan([], plan);
  assert.equal(preview.length, 3);
  const rows = loginAliasSelectRows(users, preview);
  const sophiaRow = rows.find((row) => row.loginEmail === "kubbasama@gmail.com");
  assert.equal(sophiaRow?.contactEmail, "sophia.sleiman@example.com");
  assert.equal(sophiaRow?.displayName, "Sophia Sleiman");
  assert.equal(sophiaRow?.role, "student");
  assert.equal(
    rows.some((row) => row.contactEmail === "samapostgrad@gmail.com"),
    false,
  );
});

test("runtime and the script do not rewrite users or call Clerk or email", () => {
  const store = readFileSync(
    new URL("./portal-login-alias-store.ts", import.meta.url),
    "utf8",
  );
  const script = readFileSync(
    new URL("../scripts/link-portal-login-aliases.ts", import.meta.url),
    "utf8",
  );
  const platform = readFileSync(
    new URL("../routes/platform.ts", import.meta.url),
    "utf8",
  );
  for (const source of [store, script]) {
    assert.equal(source.includes("usersTable") && source.includes(".update(usersTable)"), false);
    assert.equal(/clerkClient|createUser|createInvitation|resend|nodemailer/i.test(source), false);
  }
  assert.match(store, /portalLoginAliasesTable/);
  assert.match(store, /decideVerifiedLoginAlias/);
  assert.match(store, /isPortalAliasRole/);
  assert.match(script, /--apply/);
  assert.match(script, /--rollback/);
  assert.match(script, /--sophia-id/);
  assert.match(script, /SOPHIA_SLEIMAN_USER_ID/);
  assert.match(script, /BEFORE/);
  assert.match(script, /AFTER/);
  const finish = platform.slice(
    platform.indexOf("async function finishAliasLogin"),
    platform.indexOf("async function acceptLoginAlias"),
  );
  assert.match(finish, /resolveIdentityAccess/);
  assert.match(finish, /aliasLoginAccessOutcome/);
  assert.match(finish, /ROLE_PROVISIONING_MISMATCH/);
  assert.match(finish, /IDENTITY_NOT_PROVISIONED/);
  const hook = platform.slice(
    platform.indexOf("async function acceptLoginAlias"),
    platform.indexOf("async function requireAppUser"),
  );
  assert.match(hook, /code: "LOGIN_ALIAS"/);
  assert.match(hook, /onConflictDoNothing/);
  assert.match(hook, /loginActivityTable/);
  assert.equal(/email/i.test(hook), false);
  const gate = platform.slice(
    platform.indexOf("async function requireAppUser"),
    platform.indexOf("function ensureRole"),
  );
  assert.match(gate, /establishedAliasUser/);
  assert.match(gate, /attachVerifiedEmailAlias/);
  assert.match(gate, /finishAliasLogin/);
  assert.match(gate, /missingLoginAliasRelation/);
});

test("pins Sophia by user id and refuses an alias to an admin", () => {
  assert.equal(SOPHIA_SLEIMAN_USER_ID, "");
  const unnamed = planPortalLoginAliases({ users, aliases: [] });
  assert.equal(unnamed.ok, false);
  assert.match(unnamed.blocked.join("\n"), /Sophia Sleiman/);
  assert.equal(
    unnamed.actions.some((action) => action.email === "kubbasama@gmail.com"),
    false,
  );
  const pinned = planPortalLoginAliases({
    users,
    aliases: [],
    mappings: sophiaMappings,
  });
  assert.equal(pinned.ok, true);
  assert.equal(
    pinned.actions.find((action) => action.email === "kubbasama@gmail.com")?.userId,
    sophia.id,
  );

  const admin: LoginAliasUserSnapshot = {
    id: "33333333-3333-4333-8333-333333333333",
    email: "admin@example.com",
    displayName: "Admin",
    role: "administrator",
    clerkUserId: "user_admin",
  };
  const alias = {
    email: "admin-login@example.com",
    userId: admin.id,
    clerkUserId: "user_admin_login",
    revokedAt: null,
  };
  assert.equal(
    decideVerifiedLoginAlias({
      email: alias.email,
      clerkUserId: "user_admin_login",
      alias: { ...alias, clerkUserId: null },
      user: admin,
    }).action,
    "refuse",
  );
  assert.equal(
    decideStoredClerkAlias({
      clerkUserId: "user_admin_login",
      alias,
      user: admin,
    }).action,
    "refuse",
  );
});

test("revoking the real user's access blocks the alias login", () => {
  assert.deepEqual(
    aliasLoginAccessOutcome({
      userRole: "student",
      access: null,
      conflict: false,
    }),
    { outcome: "deny", code: "IDENTITY_NOT_PROVISIONED" },
  );
  assert.deepEqual(
    aliasLoginAccessOutcome({
      userRole: "student",
      access: { role: "student" },
      conflict: true,
    }),
    { outcome: "deny", code: "PORTAL_ACCESS_CONFIGURATION_ERROR" },
  );
  assert.deepEqual(
    aliasLoginAccessOutcome({
      userRole: "student",
      access: { role: "tutor" },
      conflict: false,
    }),
    { outcome: "deny", code: "ROLE_PROVISIONING_MISMATCH" },
  );
  assert.deepEqual(
    aliasLoginAccessOutcome({
      userRole: "tutor",
      access: { role: "tutor" },
      conflict: false,
    }),
    { outcome: "allow" },
  );
  assert.deepEqual(
    aliasLoginAccessOutcome({
      userRole: "administrator",
      access: { role: "administrator" },
      conflict: false,
    }),
    { outcome: "deny", code: "IDENTITY_NOT_PROVISIONED" },
  );
});
