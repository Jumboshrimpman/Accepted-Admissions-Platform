export type ClerkTokenGetter = (options?: {
  skipCache?: boolean;
}) => Promise<string | null | undefined>;

export type ClerkSessionIdentity = {
  userId: string | null;
  sessionId: string | null;
};

export type ClerkTokenRefreshResult = {
  token: string | null;
  /** True only when getToken timed out or threw. A resolved null is a real empty session. */
  reconnecting: boolean;
};

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

type JwtClaims = {
  exp: number | null;
  sub: string | null;
  sid: string | null;
};

const EXPIRY_SKEW_MS = 15_000;
const REFRESH_AHEAD_MS = 30_000;

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((segment.length + 3) % 4);
  if (typeof atob === "function") return atob(padded);
  return Buffer.from(padded, "base64").toString("utf8");
}

function jwtClaims(token: string): JwtClaims | null {
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(segment)) as {
      exp?: unknown;
      sub?: unknown;
      sid?: unknown;
    };
    return {
      exp: typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : null,
      sub: typeof payload.sub === "string" ? payload.sub : null,
      sid: typeof payload.sid === "string" ? payload.sid : null,
    };
  } catch {
    return null;
  }
}

export function jwtExpiresAtMs(token: string): number | null {
  return jwtClaims(token)?.exp ?? null;
}

function tokenMatchesSession(token: string, identity: ClerkSessionIdentity): boolean {
  if (!identity.userId) return false;
  const claims = jwtClaims(token);
  if (!claims?.sub || claims.sub !== identity.userId) return false;
  if (identity.sessionId && claims.sid !== identity.sessionId) return false;
  return true;
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

  function dropCached(): void {
    cached = null;
    recentFailureAt = 0;
  }

  async function attempt(getToken: ClerkTokenGetter, skipCache: boolean): Promise<ClerkTokenRefreshResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        getToken({ skipCache }).then(
          (value) => ({ kind: "resolved" as const, value: value ?? null }),
          () => ({ kind: "rejected" as const }),
        ),
        new Promise<{ kind: "timeout" }>((resolve) => {
          timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
        }),
      ]);
      if (outcome.kind === "resolved") {
        return { token: remember(outcome.value), reconnecting: false };
      }
      return { token: usable(), reconnecting: true };
    } catch {
      return { token: usable(), reconnecting: true };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function refreshWithBackoff(
    getToken: ClerkTokenGetter,
    skipCache: boolean,
  ): Promise<ClerkTokenRefreshResult> {
    const attempts = retryDelaysMs.length + 1;
    let last: string | null = usable();
    let reconnecting = false;
    for (let index = 0; index < attempts; index += 1) {
      const result = await attempt(getToken, skipCache || index > 0);
      if (result.token) return result;
      last = usable();
      reconnecting = result.reconnecting;
      if (!last) recentFailureAt = now();
      if (index < retryDelaysMs.length) await sleep(retryDelaysMs[index] ?? 0);
    }
    return { token: last, reconnecting };
  }

  function track(outcome: Promise<ClerkTokenRefreshResult>): Promise<string | null> {
    const tokenPromise = outcome.then((result) => result.token);
    refreshPromise = tokenPromise.finally(() => {
      refreshPromise = null;
    });
    return tokenPromise;
  }

  return {
    peek(): string | null {
      return usable();
    },
    clear(): void {
      dropCached();
    },
    async tokenForRequest(
      getToken: ClerkTokenGetter,
      identity?: ClerkSessionIdentity,
    ): Promise<string | null> {
      if (identity && !identity.userId) {
        dropCached();
        return null;
      }
      if (identity && cached && !tokenMatchesSession(cached.token, identity)) {
        dropCached();
      }
      const cachedToken = usable();
      const expiresSoon = cached != null && cached.expiresAtMs - now() < REFRESH_AHEAD_MS;
      if (cachedToken && !expiresSoon) return cachedToken;
      if (cachedToken) {
        void this.refreshInBackground(getToken);
        return cachedToken;
      }
      if (recentFailureAt && now() - recentFailureAt < 5_000) return null;
      const result = await attempt(getToken, false);
      if (identity && result.token && !tokenMatchesSession(result.token, identity)) {
        dropCached();
        return null;
      }
      if (!result.token) recentFailureAt = now();
      return result.token;
    },
    refresh(getToken: ClerkTokenGetter, skipCache = false): Promise<string | null> {
      return refreshWithBackoff(getToken, skipCache).then((result) => result.token);
    },
    refreshOutcome(getToken: ClerkTokenGetter, skipCache = false): Promise<ClerkTokenRefreshResult> {
      return refreshWithBackoff(getToken, skipCache);
    },
    refreshInBackground(getToken: ClerkTokenGetter): Promise<string | null> {
      if (!refreshPromise) {
        track(refreshWithBackoff(getToken, false));
      }
      return refreshPromise ?? Promise.resolve(null);
    },
    retry(getToken: ClerkTokenGetter): Promise<string | null> {
      return this.retryOutcome(getToken).then((result) => result.token);
    },
    retryOutcome(getToken: ClerkTokenGetter): Promise<ClerkTokenRefreshResult> {
      recentFailureAt = 0;
      const outcome = refreshWithBackoff(getToken, true);
      track(outcome);
      return outcome;
    },
  };
}

export const clerkSessionTokens = createClerkSessionTokenCache();

let notedClerkUserId: string | null | undefined = undefined;

export function resetNotedClerkUserForTests(): void {
  notedClerkUserId = undefined;
}

/** Clear the shared JWT cache when Clerk's user id changes or the session ends. */
export function noteClerkUserChange(userId: string | null): void {
  if (notedClerkUserId !== undefined && notedClerkUserId !== userId) {
    clerkSessionTokens.clear();
  }
  if (userId) notedClerkUserId = userId;
}
