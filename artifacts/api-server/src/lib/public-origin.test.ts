import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import {
  applyCanonicalRequestHost,
  CANONICAL_APP_ORIGIN,
  isPlatformInternalHost,
  resolvePublicRequestHost,
  resolvePublicRequestOrigin,
} from "./public-origin.ts";

const railwayHost = "accepted-admissions-platform-production.up.railway.app";

test("Railway and Vercel hostnames are platform-internal", () => {
  assert.equal(isPlatformInternalHost(railwayHost), true);
  assert.equal(isPlatformInternalHost("something.vercel.app"), true);
  assert.equal(isPlatformInternalHost("app.acceptedadmissions.org"), false);
  assert.equal(isPlatformInternalHost("localhost"), false);
});

test("public origin skips a Railway Host in favor of a later public hop", () => {
  assert.equal(
    resolvePublicRequestOrigin({
      host: railwayHost,
      forwardedHost: `${railwayHost}, app.acceptedadmissions.org`,
      forwardedProto: "https",
    }),
    CANONICAL_APP_ORIGIN,
  );
});

test("public origin ignores Railway-only proxy headers and uses APP_ORIGIN", () => {
  assert.equal(
    resolvePublicRequestOrigin(
      {
        host: railwayHost,
        forwardedHost: railwayHost,
        forwardedProto: "https",
      },
      {
        NODE_ENV: "production",
        APP_ORIGIN: "https://app.acceptedadmissions.org",
      },
    ),
    CANONICAL_APP_ORIGIN,
  );
});

test("production falls back to the canonical app origin when APP_ORIGIN is a platform host", () => {
  assert.equal(
    resolvePublicRequestOrigin(
      {
        host: railwayHost,
        forwardedHost: railwayHost,
        forwardedProto: "https",
      },
      {
        NODE_ENV: "production",
        APP_ORIGIN: "https://stale.vercel.app",
      },
    ),
    CANONICAL_APP_ORIGIN,
  );
});

test("Clerk handshake headers are rewritten off Railway before middleware", () => {
  const req = {
    headers: {
      host: railwayHost,
      "x-forwarded-host": railwayHost,
      "x-forwarded-proto": "https",
    },
  };
  applyCanonicalRequestHost(req, {
    NODE_ENV: "production",
    APP_ORIGIN: "https://app.acceptedadmissions.org",
  });
  assert.equal(req.headers.host, "app.acceptedadmissions.org");
  assert.equal(req.headers["x-forwarded-host"], "app.acceptedadmissions.org");
  assert.equal(req.headers["x-forwarded-proto"], "https");
});

test("Railway Host is replaced with the public X-Forwarded-Host Clerk would otherwise ignore", () => {
  const req = {
    headers: {
      host: railwayHost,
      "x-forwarded-host": "app.acceptedadmissions.org",
      "x-forwarded-proto": "https",
    },
  };
  applyCanonicalRequestHost(req, { NODE_ENV: "production" });
  assert.equal(req.headers.host, "app.acceptedadmissions.org");
  assert.equal(req.headers["x-forwarded-host"], "app.acceptedadmissions.org");
});

test("production without APP_ORIGIN still pins Clerk host to the canonical app origin", () => {
  const req = {
    headers: {
      host: railwayHost,
      "x-forwarded-host": railwayHost,
    },
  };
  applyCanonicalRequestHost(req, { NODE_ENV: "production" });
  assert.equal(req.headers.host, "app.acceptedadmissions.org");
  assert.equal(req.headers["x-forwarded-host"], "app.acceptedadmissions.org");
  assert.equal(req.headers["x-forwarded-proto"], "https");
});

test("localhost request hosts are left alone", () => {
  const req = {
    headers: {
      host: "localhost:3000",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
    },
  };
  applyCanonicalRequestHost(req, { NODE_ENV: "development" });
  assert.equal(req.headers.host, "localhost:3000");
  assert.equal(req.headers["x-forwarded-host"], "localhost:3000");
});

test("Clerk proxy host never falls back to Railway", () => {
  assert.equal(
    resolvePublicRequestHost(
      {
        host: railwayHost,
        forwardedHost: railwayHost,
      },
      {
        NODE_ENV: "production",
        APP_ORIGIN: "https://app.acceptedadmissions.org",
      },
    ),
    "app.acceptedadmissions.org",
  );
});
