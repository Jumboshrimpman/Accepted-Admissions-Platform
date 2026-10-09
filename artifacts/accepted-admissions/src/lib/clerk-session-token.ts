export type ClerkTokenGetter = (options?: {
  skipCache?: boolean;
}) => Promise<string | null | undefined>;

export type ClerkSessionTokenCacheOptions = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retryDelaysMs?: number[];
};

type CachedToken = {
  token: string;
  expiresAtMs: number;
};

const EXPIRY_SKEW_MS = 15_000;
const REFRESH_AHEAD_MS = 30_000;

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((segment.length + 3) % 4);
  if (typeof atob === "function") return atob(padded);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function jwtExpiresAtMs(token: string): number | null {
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(segment)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function createClerkSessionTokenCache(options: ClerkSessionTokenCacheOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? 4_000;
  const retryDelaysMs = options.retryDelaysMs ?? [500, 1_500, 4_000];
  let cached: CachedToken | null = null;
  let refreshPromise: Promise<string | null> | null = null;
  let recentFailureAt = 0;

  function usable(at = now()): string | null {
    if (!cached) return null;
    if (cached.expiresAtMs - EXPIRY_SKEW_MS <= at) return null;
    return cached.token;
  }

  function remember(token: string | null | undefined, at = now()): string | null {
    if (!token) return usable(at);
    const expiresAtMs = jwtExpiresAtMs(token);
    if (expiresAtMs == null || expiresAtMs - EXPIRY_SKEW_MS <= at) return usable(at);
    cached = { token, expiresAtMs };
    recentFailureAt = 0;
    return token;
  }

  async function attempt(getToken: ClerkTokenGetter, skipCache: boolean): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const token = await Promise.race([
        getToken({ skipCache }).then((value) => value ?? null),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
      return remember(token);
    } catch {
      return usable();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function refreshWithBackoff(getToken: ClerkTokenGetter, skipCache: boolean): Promise<string | null> {
    const attempts = retryDelaysMs.length + 1;
    let last: string | null = usable();
    for (let index = 0; index < attempts; index += 1) {
      const token = await attempt(getToken, skipCache || index > 0);
      if (token) return token;
      last = usable();
      if (!last) recentFailureAt = now();
      if (index < retryDelaysMs.length) await sleep(retryDelaysMs[index] ?? 0);
    }
    return last;
  }

  return {
    peek(): string | null {
      return usable();
    },
    clear(): void {
      cached = null;
      recentFailureAt = 0;
    },
    async tokenForRequest(getToken: ClerkTokenGetter): Promise<string | null> {
      const cachedToken = usable();
      const expiresSoon =
        cached != null && cached.expiresAtMs - now() < REFRESH_AHEAD_MS;
      if (cachedToken && !expiresSoon) return cachedToken;
      if (cachedToken) {
        void this.refreshInBackground(getToken);
        return cachedToken;
      }
      if (recentFailureAt && now() - recentFailureAt < 5_000) return null;
      const token = await attempt(getToken, false);
      if (!token) recentFailureAt = now();
      return token;
    },
    refresh(getToken: ClerkTokenGetter, skipCache = false): Promise<string | null> {
      return refreshWithBackoff(getToken, skipCache);
    },
    refreshInBackground(getToken: ClerkTokenGetter): Promise<string | null> {
      if (!refreshPromise) {
        refreshPromise = refreshWithBackoff(getToken, false).finally(() => {
          refreshPromise = null;
        });
      }
      return refreshPromise;
    },
    retry(getToken: ClerkTokenGetter): Promise<string | null> {
      recentFailureAt = 0;
      refreshPromise = refreshWithBackoff(getToken, true).finally(() => {
        refreshPromise = null;
      });
      return refreshPromise;
    },
  };
}

export const clerkSessionTokens = createClerkSessionTokenCache();
