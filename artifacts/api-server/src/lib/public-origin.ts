/**
 * Browser-facing origin for absolute URLs (Clerk handshake, Calendar OAuth,
 * Stripe redirects). Railway/Vercel platform hosts are never canonical.
 */

export const CANONICAL_APP_ORIGIN = "https://app.acceptedadmissions.org";

export type ForwardedOriginInput = {
  host?: string | string[] | null;
  forwardedHost?: string | string[] | null;
  forwardedProto?: string | string[] | null;
  protocol?: string | null;
};

function headerParts(value?: string | string[] | null): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function hostnameFromHostHeader(host: string): string {
  try {
    return new URL(`https://${host}`).hostname.toLowerCase();
  } catch {
    return host.split(":")[0]?.trim().toLowerCase() ?? "";
  }
}

export function isPlatformInternalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host.endsWith(".up.railway.app") ||
    host.endsWith(".railway.app") ||
    host.endsWith(".vercel.app")
  );
}

function firstPublicHostHeader(
  ...values: Array<string | string[] | null | undefined>
): string | undefined {
  for (const value of values) {
    for (const host of headerParts(value)) {
      const hostname = hostnameFromHostHeader(host);
      if (hostname && !isPlatformInternalHost(hostname)) return host;
    }
  }
  return undefined;
}

function originFromEnv(env: NodeJS.ProcessEnv): string | null {
  const configured = env.APP_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (!isPlatformInternalHost(url.hostname)) {
        if (env.NODE_ENV === "production" && url.protocol !== "https:") return null;
        return url.origin;
      }
    } catch {
      return null;
    }
  }
  if (env.NODE_ENV === "production") return CANONICAL_APP_ORIGIN;
  return null;
}

export function resolveConfiguredAppOrigin(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return originFromEnv(env);
}

function protoFromInput(
  input: ForwardedOriginInput,
  fallbackOrigin: string | null,
): string {
  const forwarded = headerParts(input.forwardedProto)[0];
  const protocol = input.protocol?.replace(/:$/, "");
  const candidate = forwarded || protocol || "";
  if (candidate === "http" || candidate === "https") return candidate;
  if (fallbackOrigin?.startsWith("https:")) return "https";
  return "https";
}

/** Public browser origin. Never Railway/Vercel. */
export function resolvePublicRequestOrigin(
  input: ForwardedOriginInput,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const publicHost = firstPublicHostHeader(input.forwardedHost, input.host);
  const fallbackOrigin = originFromEnv(env);
  if (publicHost) {
    const proto = protoFromInput(input, fallbackOrigin);
    if (env.NODE_ENV === "production" && proto !== "https") {
      return fallbackOrigin;
    }
    try {
      return new URL(`${proto}://${publicHost}`).origin;
    } catch {
      return fallbackOrigin;
    }
  }
  return fallbackOrigin;
}

export function resolvePublicRequestHost(
  input: ForwardedOriginInput,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const origin = resolvePublicRequestOrigin(input, env);
  if (!origin) return undefined;
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}

type MutableHostHeaders = {
  host?: string;
  "x-forwarded-host"?: string | string[];
  "x-forwarded-proto"?: string | string[];
};

/**
 * Point Host / X-Forwarded-Host at the public app origin before Clerk reads
 * them. @clerk/express handshake builds redirect_url from those headers, so a
 * Railway Host becomes form_param_value_invalid.
 */
export function applyCanonicalRequestHost(
  req: { headers: MutableHostHeaders },
  env: NodeJS.ProcessEnv = process.env,
): void {
  const currentHost = headerParts(req.headers.host)[0];
  const firstForwarded = headerParts(req.headers["x-forwarded-host"])[0];
  const hostIsInternal = Boolean(
    currentHost && isPlatformInternalHost(hostnameFromHostHeader(currentHost)),
  );
  const forwardedIsInternal = Boolean(
    firstForwarded && isPlatformInternalHost(hostnameFromHostHeader(firstForwarded)),
  );
  if (!hostIsInternal && !forwardedIsInternal) return;

  const publicHost = resolvePublicRequestHost(
    {
      host: req.headers.host,
      forwardedHost: req.headers["x-forwarded-host"],
      forwardedProto: req.headers["x-forwarded-proto"],
    },
    env,
  );
  if (!publicHost) return;

  const origin = resolvePublicRequestOrigin(
    {
      host: req.headers.host,
      forwardedHost: req.headers["x-forwarded-host"],
      forwardedProto: req.headers["x-forwarded-proto"],
    },
    env,
  );
  const proto = origin ? new URL(origin).protocol.replace(":", "") : "https";

  req.headers.host = publicHost;
  req.headers["x-forwarded-host"] = publicHost;
  req.headers["x-forwarded-proto"] = proto;
}
