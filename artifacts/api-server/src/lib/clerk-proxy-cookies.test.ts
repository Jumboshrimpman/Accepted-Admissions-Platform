import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  applyClerkProxyResponse,
  clerkProxyPublicUrl,
  sanitizedClerkSetCookies,
} from "./clerk-proxy-cookies.ts";

test("Clerk proxy URL uses one scheme even when forwarded proto is repeated", () => {
  assert.equal(
    clerkProxyPublicUrl({
      forwardedProto: "https,https",
      host: "app.acceptedadmissions.org",
      proxyPath: "/api/__clerk",
    }),
    "https://app.acceptedadmissions.org/api/__clerk",
  );
});

test("joined Set-Cookie headers are restored from raw headers and Domain is removed", () => {
  const cookies = sanitizedClerkSetCookies(
    {
      "set-cookie":
        "__client_uat=171; Domain=clerk.acceptedadmissions.org; Path=/, __session=eyJ; Domain=accepted-admissions-platform-production.up.railway.app; Path=/api/__clerk",
    },
    [
      "Set-Cookie",
      "__client_uat=171; Domain=clerk.acceptedadmissions.org; Path=/; Secure; HttpOnly; SameSite=Lax",
      "Set-Cookie",
      "__Host-session=abc.def; Domain=app.acceptedadmissions.org; Path=/; Secure; HttpOnly; SameSite=Lax",
      "Set-Cookie",
      "__session=eyJ; Domain=accepted-admissions-platform-production.up.railway.app; Path=/api/__clerk; Secure; HttpOnly",
    ],
  );
  assert.equal(cookies.length, 3);
  for (const cookie of cookies) {
    assert.equal(/domain=/i.test(cookie), false);
  }
  assert.match(cookies[0]!, /^__client_uat=171;/);
  assert.match(cookies[1]!, /^__Host-session=abc\.def;/);
  assert.match(cookies[1]!, /Path=\//);
  assert.match(cookies[1]!, /Secure/);
  assert.match(cookies[2]!, /^__session=eyJ;/);
  assert.match(cookies[2]!, /Path=\//);
});

test("the proxy response writes each Set-Cookie as its own header", async () => {
  const server = http.createServer((_req, res) => {
    applyClerkProxyResponse(res, {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": [
          "__client_uat=171; Domain=clerk.acceptedadmissions.org; Path=/; Secure; SameSite=Lax",
          "__session=eyJhbGciOiJIUzI1NiJ9.payload.sig; Domain=frontend-api.clerk.dev; Path=/; Secure; HttpOnly; SameSite=Lax",
        ],
      },
    });
    res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.match(cookies[0]!, /^__client_uat=171;/);
    assert.match(cookies[1]!, /^__session=eyJhbGciOiJIUzI1NiJ9\.payload\.sig;/);
    for (const cookie of cookies) assert.equal(/domain=/i.test(cookie), false);
    assert.equal(await response.text(), "{}");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
