/** Browser origin where Clerk production sign-in is known to work. */
export const CANONICAL_APP_ORIGIN = "https://app.acceptedadmissions.org";

/** Marketing hosts that share this SPA but are not Clerk-allowlisted. */
export const MARKETING_AUTH_REDIRECT_HOSTS = [
  "www.acceptedadmissions.org",
  "acceptedadmissions.org",
] as const;

/**
 * Portal / auth entry paths. Marketing pages (`/`, `/sat`, `/our-team`, …)
 * stay on www; only these need the app host for Clerk.
 */
export const APP_HOST_AUTH_PATH_PREFIXES = [
  "/login",
  "/sign-in",
  "/portal",
  "/tutor",
  "/admin",
  "/t-g",
  "/sso-callback",
  "/account",
  "/user",
] as const;

export type LocationLike = {
  hostname: string;
  pathname: string;
  search?: string;
  hash?: string;
};

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "").split(":")[0] ?? "";
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  const path = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }
  return path || "/";
}

export function isMarketingAuthRedirectHost(hostname: string): boolean {
  return (MARKETING_AUTH_REDIRECT_HOSTS as readonly string[]).includes(
    normalizeHostname(hostname),
  );
}

export function isAppHostAuthPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return APP_HOST_AUTH_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function shouldRedirectToCanonicalAppHost(location: LocationLike): boolean {
  return (
    isMarketingAuthRedirectHost(location.hostname) &&
    isAppHostAuthPath(location.pathname)
  );
}

/** Absolute app-host URL for the same path, or null when no redirect is needed. */
export function canonicalAppHostUrl(location: LocationLike): string | null {
  if (!shouldRedirectToCanonicalAppHost(location)) return null;
  const pathname = location.pathname.startsWith("/")
    ? location.pathname
    : `/${location.pathname}`;
  const search =
    location.search && location.search !== "?" ? location.search : "";
  const hash = location.hash ?? "";
  return `${CANONICAL_APP_ORIGIN}${pathname}${search}${hash}`;
}

export function vercelMarketingAuthRedirects(): Array<{
  source: string;
  destination: string;
  permanent: false;
  has: Array<{ type: "host"; value: string }>;
}> {
  const sources = [
    { source: "/:path(login|sign-in|portal|tutor|admin|t-g|sso-callback|account|user)", nested: false },
    { source: "/:path(login|sign-in|portal|tutor|admin|t-g|sso-callback|account|user)/:rest*", nested: true },
  ] as const;

  return MARKETING_AUTH_REDIRECT_HOSTS.flatMap((host) =>
    sources.map(({ source, nested }) => ({
      source,
      destination: nested
        ? `${CANONICAL_APP_ORIGIN}/:path/:rest*`
        : `${CANONICAL_APP_ORIGIN}/:path`,
      permanent: false as const,
      has: [{ type: "host" as const, value: host }],
    })),
  );
}
