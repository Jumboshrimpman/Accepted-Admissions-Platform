export type LegalHtmlStamp = {
  path: string;
  title: string;
  description: string;
  markup: string;
};

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function replaceOnce(
  html: string,
  pattern: RegExp,
  replacement: string,
  label: string,
): string {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const found = html.match(new RegExp(pattern.source, flags));
  if (!found || found.length !== 1) {
    throw new Error(`Expected one ${label} in index.html, found ${found?.length ?? 0}`);
  }
  return html.replace(pattern, () => replacement);
}

function replaceMeta(
  html: string,
  attribute: "name" | "property",
  key: string,
  content: string,
): string {
  return replaceOnce(
    html,
    new RegExp(
      `<meta\\s+${attribute}="${key}"\\s+content="[^"]*"\\s*\\/?>`,
    ),
    `<meta ${attribute}="${key}" content="${escapeHtmlAttribute(content)}" />`,
    `${attribute}=${key}`,
  );
}

/** Stamp a built homepage shell so /privacy and /terms are not the homepage document. */
export function stampLegalHtml(indexHtml: string, page: LegalHtmlStamp): string {
  if (!page.path.startsWith("/")) {
    throw new Error(`Legal page path must start with /, received ${page.path}`);
  }
  const canonical = indexHtml.match(
    /<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/,
  );
  if (!canonical?.[1]) {
    throw new Error("index.html is missing a canonical URL");
  }
  const origin = new URL(canonical[1]).origin;
  const pageUrl = `${origin}${page.path}`;

  let html = replaceOnce(
    indexHtml,
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtmlAttribute(page.title)}</title>`,
    "title",
  );
  html = replaceMeta(html, "name", "description", page.description);
  html = replaceMeta(html, "property", "og:title", page.title);
  html = replaceMeta(html, "property", "og:description", page.description);
  html = replaceMeta(html, "property", "og:url", pageUrl);
  html = replaceMeta(html, "name", "twitter:title", page.title);
  html = replaceMeta(html, "name", "twitter:description", page.description);
  html = replaceOnce(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeHtmlAttribute(pageUrl)}" />`,
    "canonical",
  );
  return replaceOnce(
    html,
    /<div id="root">\s*<\/div>/,
    `<div id="root">${page.markup}</div>`,
    "#root",
  );
}
