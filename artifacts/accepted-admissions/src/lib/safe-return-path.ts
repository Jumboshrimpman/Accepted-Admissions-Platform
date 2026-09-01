export function safeReturnPath({
  requested,
  basePath,
  origin,
  fallback,
}: {
  requested: string | null;
  basePath: string;
  origin: string;
  fallback: string;
}): string {
  if (!requested || !requested.startsWith("/") || requested.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(requested, origin);
    const normalizedBase = basePath.replace(/\/$/, "");
    const withinBase =
      !normalizedBase ||
      url.pathname === normalizedBase ||
      url.pathname.startsWith(`${normalizedBase}/`);

    if (url.origin !== origin || !withinBase) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}