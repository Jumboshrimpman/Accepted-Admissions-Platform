import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { stampLegalHtml } from "../src/lib/legal-static-html";
import { LEGAL_EFFECTIVE_DATE } from "../src/pages/public/legal-page";
import PrivacyPolicy, {
  GOOGLE_LIMITED_USE_SENTENCE,
  PRIVACY_DESCRIPTION,
  PRIVACY_TITLE,
} from "../src/pages/public/privacy";
import TermsOfService, { TERMS_DESCRIPTION, TERMS_TITLE } from "../src/pages/public/terms";

const outputDir = join(process.cwd(), "dist/public");

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function renderPage(path: string, page: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(
    createElement(Router, { ssrPath: path, ssrSearch: "" }, page),
  );
}

const indexHtml = readFileSync(join(outputDir, "index.html"), "utf8");

const pages = [
  {
    path: "/privacy",
    file: "privacy.html",
    title: PRIVACY_TITLE,
    description: PRIVACY_DESCRIPTION,
    markup: renderPage("/privacy", createElement(PrivacyPolicy)),
    required: [
      GOOGLE_LIMITED_USE_SENTENCE,
      LEGAL_EFFECTIVE_DATE,
      "Google user data",
      "openid, email, calendar.freebusy, and calendar.events",
      "third-party meeting or transcription provider",
      "AI service providers",
      "does not send the student’s name, email, account, or scores",
      "should create or authorize the account",
    ],
    forbidden: [] as readonly string[],
  },
  {
    path: "/terms",
    file: "terms.html",
    title: TERMS_TITLE,
    description: TERMS_DESCRIPTION,
    markup: renderPage("/terms", createElement(TermsOfService)),
    required: [
      LEGAL_EFFECTIVE_DATE,
      "prepaid hourly credits",
      "refundable only before that client’s first tutoring session",
      "all purchases are non-refundable",
      "at least 24 hours in advance",
      "laws of the State of New Jersey",
      "30 days after written notice",
    ],
    forbidden: ["Placeholder — owner to complete", "arbitration", "class action", "class-action"],
  },
] as const;

for (const page of pages) {
  const html = stampLegalHtml(indexHtml, page);
  const text = visibleText(html);
  for (const snippet of page.required) {
    if (!text.includes(snippet)) {
      throw new Error(`${page.file} is missing required text: ${snippet}`);
    }
  }
  for (const snippet of page.forbidden) {
    if (text.toLowerCase().includes(snippet.toLowerCase())) {
      throw new Error(`${page.file} still contains forbidden text: ${snippet}`);
    }
  }
  if (html.includes("Your next step, made clear") || text.includes("Your next step, made clear")) {
    throw new Error(`${page.file} still contains the homepage title`);
  }
  writeFileSync(join(outputDir, page.file), html);
  console.log(`Wrote ${page.file} (${html.length} bytes)`);
}
