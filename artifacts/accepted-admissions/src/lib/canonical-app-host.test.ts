import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  APP_HOST_AUTH_PATH_PREFIXES,
  CANONICAL_APP_ORIGIN,
  MARKETING_AUTH_REDIRECT_HOSTS,
  canonicalAppHostUrl,
  isAppHostAuthPath,
  isMarketingAuthRedirectHost,
  shouldRedirectToCanonicalAppHost,
  vercelMarketingAuthRedirects,
} from "./canonical-app-host.ts";

test("treats www and apex as marketing hosts, not the app host", () => {
  assert.equal(isMarketingAuthRedirectHost("www.acceptedadmissions.org"), true);
  assert.equal(isMarketingAuthRedirectHost("acceptedadmissions.org"), true);
  assert.equal(isMarketingAuthRedirectHost("WWW.AcceptedAdmissions.org."), true);
  assert.equal(isMarketingAuthRedirectHost("app.acceptedadmissions.org"), false);
  assert.equal(isMarketingAuthRedirectHost("localhost"), false);
  assert.equal(isMarketingAuthRedirectHost("accepted-admissions.vercel.app"), false);
});

test("matches portal and auth paths without colliding with lookalikes", () => {
  assert.equal(isAppHostAuthPath("/login"), true);
  assert.equal(isAppHostAuthPath("/login/sso-callback"), true);
  assert.equal(isAppHostAuthPath("/login/"), true);
  assert.equal(isAppHostAuthPath("/portal/sat"), true);
  assert.equal(isAppHostAuthPath("/tutor"), true);
  assert.equal(isAppHostAuthPath("/admin/content"), true);
  assert.equal(isAppHostAuthPath("/t-g"), true);
  assert.equal(isAppHostAuthPath("/sso-callback"), true);
  assert.equal(isAppHostAuthPath("/"), false);
  assert.equal(isAppHostAuthPath("/sat"), false);
  assert.equal(isAppHostAuthPath("/our-team"), false);
  assert.equal(isAppHostAuthPath("/login-help"), false);
});

test("sends www and apex auth entry to the same path on the app host", () => {
  assert.equal(
    canonicalAppHostUrl({
      hostname: "www.acceptedadmissions.org",
      pathname: "/login",
      search: "?returnTo=%2Fportal%2Fsat",
    }),
    "https://app.acceptedadmissions.org/login?returnTo=%2Fportal%2Fsat",
  );
  assert.equal(
    canonicalAppHostUrl({
      hostname: "acceptedadmissions.org",
      pathname: "/portal",
    }),
    "https://app.acceptedadmissions.org/portal",
  );
  assert.equal(
    canonicalAppHostUrl({
      hostname: "www.acceptedadmissions.org",
      pathname: "/tutor/profile",
      hash: "#calendar",
    }),
    "https://app.acceptedadmissions.org/tutor/profile#calendar",
  );
});

test("leaves marketing pages and the working app host alone", () => {
  assert.equal(
    shouldRedirectToCanonicalAppHost({
      hostname: "www.acceptedadmissions.org",
      pathname: "/",
    }),
    false,
  );
  assert.equal(
    canonicalAppHostUrl({
      hostname: "www.acceptedadmissions.org",
      pathname: "/sat",
    }),
    null,
  );
  assert.equal(
    canonicalAppHostUrl({
      hostname: "app.acceptedadmissions.org",
      pathname: "/login",
    }),
    null,
  );
  assert.equal(
    canonicalAppHostUrl({
      hostname: "localhost",
      pathname: "/login",
    }),
    null,
  );
});

test("vercel.json redirects www and apex auth paths to the app host only", () => {
  const vercelPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../vercel.json",
  );
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8")) as {
    redirects?: Array<{
      source: string;
      destination: string;
      permanent?: boolean;
      has?: Array<{ type?: string; value?: string }>;
    }>;
  };

  const redirects = vercel.redirects ?? [];
  assert.ok(redirects.length > 0, "expected host-conditioned auth redirects");

  for (const redirect of redirects) {
    const hosts = (redirect.has ?? [])
      .filter((rule) => rule.type === "host")
      .map((rule) => rule.value ?? "");
    assert.ok(hosts.length > 0, `${redirect.source} must be host-conditioned`);
    for (const host of hosts) {
      assert.ok(
        (MARKETING_AUTH_REDIRECT_HOSTS as readonly string[]).includes(host),
        `${redirect.source} must not match ${host}`,
      );
      assert.notEqual(host, "app.acceptedadmissions.org");
    }
    assert.ok(
      redirect.destination.startsWith(CANONICAL_APP_ORIGIN),
      redirect.destination,
    );
    assert.notEqual(redirect.permanent, true);
  }

  const expected = vercelMarketingAuthRedirects();
  assert.equal(redirects.length, expected.length);
  for (const rule of expected) {
    assert.ok(
      redirects.some(
        (redirect) =>
          redirect.source === rule.source &&
          redirect.destination === rule.destination &&
          redirect.has?.[0]?.value === rule.has[0]?.value,
      ),
      `missing ${rule.has[0]?.value} ${rule.source}`,
    );
  }

  for (const prefix of APP_HOST_AUTH_PATH_PREFIXES) {
    const name = prefix.slice(1);
    assert.ok(
      redirects.some((redirect) => redirect.source.includes(name)),
      `vercel redirects should cover ${prefix}`,
    );
  }
});
