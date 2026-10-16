import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { stampLegalHtml } from "./legal-static-html.ts";

const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Accepted Admissions | Your next step, made clear</title>
    <meta name="description" content="Explore focused SAT tutoring with the Accepted Admissions team or request a private conversation about broader admissions guidance." />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://www.acceptedadmissions.org/" />
    <meta property="og:title" content="Accepted Admissions | Your next step, made clear" />
    <meta property="og:description" content="Explore focused SAT tutoring with the Accepted Admissions team or request a private conversation about broader admissions guidance." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://www.acceptedadmissions.org/" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Accepted Admissions | Your next step, made clear" />
    <meta name="twitter:description" content="Explore focused SAT tutoring with the Accepted Admissions team or request a private conversation about broader admissions guidance." />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

test("stamps a legal page onto the homepage shell without leaving homepage metadata", () => {
  const html = stampLegalHtml(indexHtml, {
    path: "/privacy",
    title: "Privacy Policy | Accepted Admissions",
    description: 'How we handle "personal" information & records.',
    markup: "<main>Privacy Policy body</main>",
  });

  assert.match(html, /<title>Privacy Policy \| Accepted Admissions<\/title>/);
  assert.match(
    html,
    /<meta name="description" content="How we handle &quot;personal&quot; information &amp; records\." \/>/,
  );
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/www\.acceptedadmissions\.org\/privacy" \/>/,
  );
  assert.match(
    html,
    /<meta property="og:url" content="https:\/\/www\.acceptedadmissions\.org\/privacy" \/>/,
  );
  assert.match(html, /<meta property="og:type" content="website" \/>/);
  assert.match(html, /<div id="root"><main>Privacy Policy body<\/main><\/div>/);
  assert.equal(html.includes("Your next step, made clear"), false);
  assert.equal(html.includes("Explore focused SAT tutoring"), false);
});

test("vercel serves privacy and terms before the homepage fallback", () => {
  const vercelPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../vercel.json",
  );
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8")) as {
    rewrites?: Array<{ source?: string; destination?: string }>;
  };
  const rewrites = vercel.rewrites ?? [];
  const privacy = rewrites.findIndex((rule) => rule.source === "/privacy");
  const terms = rewrites.findIndex((rule) => rule.source === "/terms");
  const spa = rewrites.findIndex((rule) => rule.destination === "/index.html");

  assert.ok(privacy !== -1 && privacy < spa, "privacy rewrite must precede the SPA fallback");
  assert.ok(terms !== -1 && terms < spa, "terms rewrite must precede the SPA fallback");
  assert.equal(rewrites[privacy]?.destination, "/privacy.html");
  assert.equal(rewrites[terms]?.destination, "/terms.html");
});

test("vercel redirects only privacy and terms trailing slashes", () => {
  const vercelPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../vercel.json",
  );
  const vercel = JSON.parse(readFileSync(vercelPath, "utf8")) as {
    trailingSlash?: boolean;
    redirects?: Array<{ source?: string; destination?: string; permanent?: boolean }>;
  };

  assert.equal(vercel.trailingSlash, undefined);
  const redirects = vercel.redirects ?? [];
  assert.equal(redirects.find((rule) => rule.source === "/privacy/")?.destination, "/privacy");
  assert.equal(redirects.find((rule) => rule.source === "/privacy/")?.permanent, true);
  assert.equal(redirects.find((rule) => rule.source === "/terms/")?.destination, "/terms");
  assert.equal(redirects.find((rule) => rule.source === "/terms/")?.permanent, true);
  assert.equal(
    redirects.filter((rule) => rule.source?.endsWith("/") && rule.destination?.startsWith("/")).length,
    2,
  );
});
