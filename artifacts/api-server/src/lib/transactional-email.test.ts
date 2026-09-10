import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { sendTransactionalEmail } from "./transactional-email.ts";

test("skips email when Resend is not configured", async () => {
  const previous = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const result = await sendTransactionalEmail({
    to: "admin@acceptedadmissions.org",
    subject: "Report",
    text: "A student reported a question.",
  });
  assert.equal(result.status, "skipped");
  if (previous === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previous;
});

test("sends through Resend when an API key is present", async () => {
  const previous = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  const result = await sendTransactionalEmail(
    {
      to: "admin@acceptedadmissions.org",
      subject: "Question report",
      text: "Q15 looks broken",
    },
    async () =>
      new Response(JSON.stringify({ id: "email_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  assert.deepEqual(result, { status: "sent", id: "email_1" });
  if (previous === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previous;
});
