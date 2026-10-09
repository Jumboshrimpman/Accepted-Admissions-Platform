import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import {
  clerkExplicitSignOut,
  clerkSignedInGate,
  clerkSignedOutSuppressed,
  hasEstablishedClerkSession,
  markClerkSessionEstablished,
  shouldHoldSignedInShell,
} from "@/lib/clerk-session-gate";
import { clerkSessionTokens, type ClerkTokenGetter } from "@/lib/clerk-session-token";

const SLOW_CLERK_MS = 8_000;

export type PortalAuthValue = {
  clerkAvailable: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  reason: "missing" | "invalid" | null;
  /** Keep the student page mounted through a Clerk token refresh blip. */
  holdSignedInShell?: boolean;
  /** Show Reconnecting copy instead of an indefinite "Checking your session…". */
  reconnecting?: boolean;
  retrySession?: () => void;
};

const defaultPortalAuth: PortalAuthValue = {
  clerkAvailable: true,
  isLoaded: true,
  isSignedIn: false,
  reason: null,
  holdSignedInShell: false,
  reconnecting: false,
  retrySession: () => {},
};

const PortalAuthContext = createContext<PortalAuthValue>(defaultPortalAuth);

export function PortalAuthProvider({
  value,
  children,
}: {
  value: PortalAuthValue;
  children: ReactNode;
}) {
  return (
    <PortalAuthContext.Provider value={{ ...defaultPortalAuth, ...value }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function ClerkPortalAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const queryClient = useQueryClient();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [tokenReconnecting, setTokenReconnecting] = useState(false);
  const [slow, setSlow] = useState(false);
  const [signedOutAt, setSignedOutAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [retryNonce, setRetryNonce] = useState(0);
  const signedIn = Boolean(isSignedIn);

  useEffect(() => {
    if (signedIn) {
      markClerkSessionEstablished();
      setSignedOutAt(null);
      return;
    }
    if (isLoaded && hasEstablishedClerkSession() && !clerkExplicitSignOut()) {
      setSignedOutAt((current) => current ?? Date.now());
    }
  }, [isLoaded, signedIn]);

  useEffect(() => {
    if (signedIn || !hasEstablishedClerkSession() || clerkExplicitSignOut()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [signedIn, isLoaded, retryNonce]);

  useEffect(() => {
    const unsettled = !isLoaded || tokenReconnecting || (hasEstablishedClerkSession() && !signedIn);
    if (!unsettled) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), SLOW_CLERK_MS);
    return () => window.clearTimeout(timer);
  }, [isLoaded, signedIn, tokenReconnecting]);

  useEffect(() => {
    const readToken: ClerkTokenGetter = (options) => getTokenRef.current(options);
    setAuthTokenGetter(() => clerkSessionTokens.tokenForRequest(readToken));
    return () => setAuthTokenGetter(null);
  }, []);

  useEffect(() => {
    if (!signedIn && !hasEstablishedClerkSession()) return;
    if (clerkExplicitSignOut()) return;
    let cancelled = false;
    void clerkSessionTokens
      .refresh((options) => getTokenRef.current(options))
      .then((token) => {
        if (!cancelled) setTokenReconnecting(!token);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, retryNonce]);

  const signedOutForMs = signedOutAt == null ? 0 : Math.max(0, now - signedOutAt);
  const holdSignedInShell = shouldHoldSignedInShell({
    established: hasEstablishedClerkSession(),
    explicitSignOut: clerkExplicitSignOut(),
    isLoaded,
    isSignedIn: signedIn,
    tokenReconnecting,
    signedOutForMs,
  });
  const reconnecting = holdSignedInShell || tokenReconnecting || (slow && !isLoaded);

  const retrySession = () => {
    setSlow(false);
    setSignedOutAt(null);
    setRetryNonce((nonce) => nonce + 1);
    void clerkSessionTokens.retry((options) => getTokenRef.current(options)).then((token) => {
      setTokenReconnecting(!token);
      if (token) void queryClient.invalidateQueries();
    });
  };

  return (
    <PortalAuthProvider
      value={{
        clerkAvailable: true,
        isLoaded,
        isSignedIn: signedIn,
        reason: null,
        holdSignedInShell,
        reconnecting,
        retrySession,
      }}
    >
      {children}
    </PortalAuthProvider>
  );
}

export function usePortalAuth(): PortalAuthValue {
  return useContext(PortalAuthContext);
}

/**
 * Signed-out chrome stays visible while Clerk is loading or unavailable.
 * Hiding it behind Clerk `<Show>` made the header/landing look like there
 * was no portal sign-in when the Frontend API never became ready.
 */
export function WhenSignedOut({ children }: { children: ReactNode }) {
  const auth = usePortalAuth();
  if (auth.isSignedIn) return null;
  return <>{children}</>;
}

export function WhenSignedIn({ children }: { children: ReactNode }) {
  const auth = usePortalAuth();
  if (!auth.isLoaded || !auth.isSignedIn) return null;
  return <>{children}</>;
}

export function AuthSessionLoading({
  message = "Checking your session…",
  detail,
  onRetry,
}: {
  message?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="min-h-[40vh] flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground"
      data-testid="status-auth-loading"
    >
      <p>{message}</p>
      {detail ? <p className="max-w-md text-sm">{detail}</p> : null}
      {onRetry ? (
        <button
          type="button"
          data-testid="auth-session-retry"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function SessionReconnectNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="status"
      data-testid="status-auth-reconnecting"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <p>
        <span className="font-semibold">Reconnecting…</span> Refreshing your sign-in is slow. This
        page stays open so the quiz is not paused.
      </p>
      {onRetry ? (
        <button
          type="button"
          data-testid="auth-session-retry"
          className="rounded-full bg-amber-950 px-3 py-1.5 text-xs font-medium text-white"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function SignedIn({ children }: { children: ReactNode }) {
  const auth = usePortalAuth();
  const mode = clerkSignedInGate(auth);
  if (mode === "hold" || mode === "children") {
    return (
      <div className="contents" data-testid="signed-in-shell">
        {mode === "hold" ? (
          <SessionReconnectNotice key="reconnect" onRetry={auth.retrySession} />
        ) : null}
        <div key="page" className="contents">
          {children}
        </div>
      </div>
    );
  }
  if (mode === "reconnecting") {
    return (
      <AuthSessionLoading
        message="Reconnecting…"
        detail="Refreshing your sign-in is taking longer than usual."
        onRetry={auth.retrySession}
      />
    );
  }
  if (mode === "checking") {
    return <AuthSessionLoading message="Checking your session…" />;
  }
  if (mode === "signed-out") return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const auth = usePortalAuth();
  if (clerkSignedOutSuppressed(auth)) return null;
  return <>{children}</>;
}
