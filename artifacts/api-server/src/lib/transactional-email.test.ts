import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  ADMIN_INBOX_EMAIL,
  isAdminInboxEmail,
  sendTransactionalEmail,
  setTransactionalEmailTestTransport,
} from "./transactional-email.ts";

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

test("admin inbox comparison is case-insensitive and uses the canonical address", () => {
  assert.equal(ADMIN_INBOX_EMAIL, "admin@acceptedadmissions.org");
  assert.equal(isAdminInboxEmail("Admin@AcceptedAdmissions.ORG"), true);
  assert.equal(isAdminInboxEmail("sama@example.com"), false);
});

test("skips optional email when Resend is not configured", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  setTransactionalEmailTestTransport(undefined);
  try {
    const result = await sendTransactionalEmail({
      to: "admin@acceptedadmissions.org",
      subject: "Report",
      text: "A student reported a question.",
    });
    assert.equal(result.status, "skipped");
    if (result.status === "skipped") {
      assert.match(result.reason, /RESEND_API_KEY/);
    }
  } finally {
    restoreEnv("RESEND_API_KEY", previous);
  }
});

test("required email fails closed when no transport is configured", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  setTransactionalEmailTestTransport(undefined);
  try {
    const result = await sendTransactionalEmail({
      to: "admin@acceptedadmissions.org",
      subject: "Guidance request",
      text: "A family asked for tutoring.",
      required: true,
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.match(result.error, /RESEND_API_KEY/);
    }
  } finally {
    restoreEnv("RESEND_API_KEY", previous);
  }
});

test("does not invent a sent result without a transport", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  setTransactionalEmailTestTransport(undefined);
  try {
    const result = await sendTransactionalEmail({
      to: "admin@acceptedadmissions.org",
      subject: "No transport",
      text: "Must not claim success.",
      required: true,
    });
    assert.notEqual(result.status, "sent");
  } finally {
    restoreEnv("RESEND_API_KEY", previous);
  }
});

test("sends through Resend when an API key is present", async () => {
  const previous = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = "re_test";
  delete process.env.RESEND_FROM_EMAIL;
  setTransactionalEmailTestTransport(undefined);
  let captured: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;
  try {
    const result = await sendTransactionalEmail(
      {
        to: "Admin@AcceptedAdmissions.ORG",
        replyTo: "parent@example.invalid",
        subject: "Question report",
        text: "Q15 looks broken",
      },
      async (url, init) => {
        captured = {
          url: String(url),
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        };
        return new Response(JSON.stringify({ id: "email_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    assert.deepEqual(result, { status: "sent", id: "email_1" });
    assert.equal(captured?.url, "https://api.resend.com/emails");
    assert.equal(captured?.headers.get("authorization"), "Bearer re_test");
    assert.deepEqual(captured?.body.to, ["admin@acceptedadmissions.org"]);
    assert.equal(captured?.body.reply_to, "parent@example.invalid");
    assert.equal(captured?.body.from, "Accepted Admissions <noreply@acceptedadmissions.org>");
  } finally {
    restoreEnv("RESEND_API_KEY", previous);
    restoreEnv("RESEND_FROM_EMAIL", previousFrom);
  }
});

test("returns failed when the Resend transport rejects the message", async () => {
  const previous = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  setTransactionalEmailTestTransport(undefined);
  try {
    const result = await sendTransactionalEmail(
      {
        to: "admin@acceptedadmissions.org",
        subject: "Broken",
        text: "should fail",
        required: true,
      },
      async () => new Response("domain not verified", { status: 403 }),
    );
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.match(result.error, /domain not verified/);
    }
  } finally {
    restoreEnv("RESEND_API_KEY", previous);
  }
});

test("mock test transport is the only way to send without Resend", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  setTransactionalEmailTestTransport(async (input) => {
    assert.deepEqual(input.to, "admin@acceptedadmissions.org");
    return { status: "sent", id: "mock_1" };
  });
  try {
    const result = await sendTransactionalEmail({
      to: "admin@acceptedadmissions.org",
      subject: "Mocked",
      text: "Delivered by the test transport.",
      required: true,
    });
    assert.deepEqual(result, { status: "sent", id: "mock_1" });
  } finally {
    setTransactionalEmailTestTransport(undefined);
    restoreEnv("RESEND_API_KEY", previous);
  }
});
