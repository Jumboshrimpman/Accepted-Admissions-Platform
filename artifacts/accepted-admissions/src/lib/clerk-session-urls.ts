import {
  CANONICAL_APP_ORIGIN,
  isAppHostAuthPath,
  isMarketingAuthRedirectHost,
} from "./canonical-app-host.ts";

const CLERK_ACCOUNT_HOST_SUFFIXES = [
  ".clerk.accounts.dev",
  ".accounts.dev",
] as const;

export function isClerkAccountHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  if (host === "accounts.acceptedadmissions.org") return true;
  if (host === "accounts.app.acceptedadmissions.org") return true;
  return CLERK_ACCOUNT_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function clerkSignInUrl(
  basePath: string,
  location: { hostname: string; origin: string } = typeof window === "undefined"
    ? { hostname: "", origin: CANONICAL_APP_ORIGIN }
    : window.location,
): string {
  const path = `${basePath}/login`.replace(/\/{2,}/g, "/") || "/login";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const hostname = location.hostname.trim().toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return `${location.origin}${normalized}`;
  }
  if (
    isMarketingAuthRedirectHost(hostname) ||
    hostname === "app.acceptedadmissions.org" ||
    isClerkAccountHost(hostname)
  ) {
    return `${CANONICAL_APP_ORIGIN}${normalized === "/login" ? "/login" : normalized}`;
  }
  return `${location.origin}${normalized}`;
}

export function stripAppBasePath(path: string, basePath: string): string {
  if (!path) return "/";
  if (basePath && path.startsWith(basePath)) {
    return path.slice(basePath.length) || "/";
  }
  return path;
}

export type ClerkRouterDestination =
  | { type: "in-app"; path: string }
  | { type: "hard"; url: string };

export function clerkRouterDestination(
  to: string,
  basePath: string,
  currentOrigin: string = typeof window === "undefined"
    ? CANONICAL_APP_ORIGIN
    : window.location.origin,
): ClerkRouterDestination {
  const fallbackPath = "/portal";
  if (!to.startsWith("http://") && !to.startsWith("https://")) {
    const [pathname = "/", rest = ""] = to.split(/(?=[?#])/);
    return {
      type: "in-app",
      path: `${stripAppBasePath(pathname, basePath)}${rest}`,
    };
  }

  let url: URL;
  try {
    url = new URL(to);
  } catch {
    return { type: "in-app", path: fallbackPath };
  }

  if (isClerkAccountHost(url.hostname)) {
    return { type: "hard", url: `${CANONICAL_APP_ORIGIN}${fallbackPath}` };
  }

  if (isMarketingAuthRedirectHost(url.hostname) && isAppHostAuthPath(url.pathname)) {
    return {
      type: "hard",
      url: `${CANONICAL_APP_ORIGIN}${url.pathname}${url.search}${url.hash}`,
    };
  }

  const current = (() => {
    try {
      return new URL(currentOrigin);
    } catch {
      return new URL(CANONICAL_APP_ORIGIN);
    }
  })();

  if (
    url.origin === current.origin ||
    url.origin === CANONICAL_APP_ORIGIN
  ) {
    return {
      type: "in-app",
      path: `${stripAppBasePath(url.pathname, basePath)}${url.search}${url.hash}`,
    };
  }

  return { type: "hard", url: `${CANONICAL_APP_ORIGIN}${fallbackPath}` };
}

export function applyClerkRouterNavigation(
  to: string,
  basePath: string,
  setLocation: (path: string, options?: { replace?: boolean }) => void,
  options: {
    replace?: boolean;
    currentOrigin?: string;
    assign?: (url: string) => void;
  } = {},
): void {
  const destination = clerkRouterDestination(
    to,
    basePath,
    options.currentOrigin,
  );
  if (destination.type === "hard") {
    const assign =
      options.assign ??
      ((url: string) => {
        if (typeof window !== "undefined") window.location.assign(url);
      });
    assign(destination.url);
    return;
  }
  setLocation(destination.path, options.replace ? { replace: true } : undefined);
}
