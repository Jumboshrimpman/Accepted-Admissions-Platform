const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

type HeaderValue = string | string[] | undefined;
type HeaderMap = Record<string, HeaderValue>;

export function collectSetCookieHeaders(
  headers: HeaderMap,
  rawHeaders?: readonly string[],
): string[] {
  const fromRaw: string[] = [];
  if (rawHeaders) {
    for (let index = 0; index < rawHeaders.length; index += 2) {
      const name = rawHeaders[index];
      const value = rawHeaders[index + 1];
      if (name && value && name.toLowerCase() === "set-cookie") fromRaw.push(value);
    }
  }
  if (fromRaw.length > 0) return fromRaw;
  const parsed = headers["set-cookie"];
  if (Array.isArray(parsed)) return parsed.filter((value) => value.trim());
  if (typeof parsed === "string" && parsed.trim()) return [parsed];
  return [];
}

/**
 * Host-only cookies for the browser host that served the proxy response.
 * A Domain of clerk.* or *.up.railway.app is rejected by the browser, which
 * drops the session on the next navigation. __Host- cookies cannot have a Domain.
 */
export function sanitizeClerkProxyCookie(cookie: string): string {
  const parts = cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const pair = parts[0];
  if (!pair || !pair.includes("=")) return "";
  const name = pair.slice(0, pair.indexOf("=")).trim();
  const hostPrefixed = name.startsWith("__Host-");
  const securePrefixed = hostPrefixed || name.startsWith("__Secure-");
  const extras: string[] = [];
  let path = "";
  let secure = false;
  let sameSite = "";
  for (const attr of parts.slice(1)) {
    const eq = attr.indexOf("=");
    const key = (eq === -1 ? attr : attr.slice(0, eq)).trim().toLowerCase();
    const rawValue = eq === -1 ? "" : attr.slice(eq + 1).trim();
    if (key === "domain") continue;
    if (key === "path") {
      path = rawValue || "/";
      continue;
    }
    if (key === "secure") {
      secure = true;
      continue;
    }
    if (key === "samesite") {
      sameSite = rawValue || "Lax";
      continue;
    }
    extras.push(attr);
  }
  if (
    hostPrefixed ||
    path === "/api/__clerk" ||
    path.startsWith("/api/__clerk/")
  ) {
    path = "/";
  }
  if (!path) path = "/";
  if (securePrefixed) secure = true;
  const out = [pair, `Path=${path.startsWith("/") ? path : `/${path}`}`];
  if (secure) out.push("Secure");
  out.push(`SameSite=${sameSite || "Lax"}`);
  out.push(...extras);
  return out.join("; ");
}

export function sanitizedClerkSetCookies(
  headers: HeaderMap,
  rawHeaders?: readonly string[],
): string[] {
  return collectSetCookieHeaders(headers, rawHeaders)
    .map(sanitizeClerkProxyCookie)
    .filter(Boolean);
}

export function clerkProxyPublicUrl(input: {
  forwardedProto?: string | string[] | null;
  host?: string | null;
  proxyPath: string;
}): string {
  const raw = Array.isArray(input.forwardedProto)
    ? input.forwardedProto.join(",")
    : (input.forwardedProto ?? "");
  const proto =
    raw
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .find((part) => part === "http" || part === "https") ?? "https";
  return `${proto}://${input.host ?? ""}${input.proxyPath}`;
}

type WritableResponse = {
  writeHead: (status: number, headers: Record<string, string | string[]>) => void;
};

/** Copy upstream headers and emit each Set-Cookie separately, host-only. */
export function applyClerkProxyResponse(
  res: WritableResponse,
  proxyRes: {
    statusCode?: number;
    headers: HeaderMap;
    rawHeaders?: readonly string[];
  },
): void {
  const setCookies = sanitizedClerkSetCookies(proxyRes.headers, proxyRes.rawHeaders);
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(proxyRes.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === "set-cookie" || HOP_BY_HOP.has(lower)) continue;
    headers[key] = value;
  }
  if (setCookies.length > 0) headers["set-cookie"] = setCookies;
  res.writeHead(proxyRes.statusCode ?? 502, headers);
}
