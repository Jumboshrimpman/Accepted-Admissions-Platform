import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@clerk/react";

export type PortalAuthValue = {
  clerkAvailable: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  reason: "missing" | "invalid" | null;
};

const defaultPortalAuth: PortalAuthValue = {
  clerkAvailable: true,
  isLoaded: true,
  isSignedIn: false,
  reason: null,
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
    <PortalAuthContext.Provider value={value}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function ClerkPortalAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  return (
    <PortalAuthProvider
      value={{
        clerkAvailable: true,
        isLoaded,
        isSignedIn: Boolean(isSignedIn),
        reason: null,
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
}: {
  message?: string;
}) {
  return (
    <div
      className="min-h-[40vh] flex items-center justify-center text-muted-foreground"
      data-testid="status-auth-loading"
    >
      {message}
    </div>
  );
}
