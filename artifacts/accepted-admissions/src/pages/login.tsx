import { useEffect, useState, type ReactNode } from "react";
import { SignIn } from "@clerk/react";
import { Redirect } from "wouter";
import { ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";
import { usePortalAuth } from "@/components/portal-auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  clerkConfigErrorCopy,
  clerkJsScriptUrl,
  clerkLoadFailureCopy,
} from "@/lib/clerk-publishable-key";
import { safeReturnPath } from "@/lib/safe-return-path";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
export const CLERK_LOAD_TIMEOUT_MS = 10_000;

function homeHref(): string {
  return basePath || "/";
}

export function loginReturnPath(
  search = typeof window === "undefined" ? "" : window.location.search,
  origin = typeof window === "undefined" ? "https://app.acceptedadmissions.org" : window.location.origin,
): string {
  const requestedReturnTo = new URLSearchParams(search).get("returnTo");
  return safeReturnPath({
    requested: requestedReturnTo,
    basePath,
    origin,
    fallback: `${basePath}/portal`,
  });
}

function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
        <a
          href={homeHref()}
          className="inline-flex w-fit text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          data-testid="link-login-home"
        >
          ← Back to home
        </a>
        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

function LoginIntro({
  returnTo,
}: {
  returnTo: string;
}) {
  const returningSomewhereElse =
    returnTo !== `${basePath}/portal` && returnTo !== "/portal";

  return (
    <div className="mb-6">
      <p className="font-metadata text-accent">Portal access</p>
      <h1 className="font-display mt-2 text-3xl tracking-tight" data-testid="heading-login">
        Sign in to your portal
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground" data-testid="text-login-helper">
        Students, tutors, and administrators use the same sign-in. After you
        authenticate, you continue to your dashboard
        {returningSomewhereElse
          ? " or the page you were opening."
          : " (/portal, /tutor, or /admin)."}
      </p>
    </div>
  );
}

export function LoginLoadingState({
  label = "Loading secure sign-in…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground"
      data-testid="status-login-loading"
      role="status"
    >
      <Spinner className="size-6" />
      <p>{label}</p>
    </div>
  );
}

export function LoginErrorState({
  title,
  body,
  failedHost,
  scriptUrl,
}: {
  title: string;
  body: string;
  failedHost?: string;
  scriptUrl?: string;
}) {
  return (
    <div className="text-center" data-testid="status-login-error" role="alert">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
      {failedHost ? (
        <p className="mt-4 font-mono text-sm break-all text-foreground" data-testid="text-login-failed-host">
          {failedHost}
        </p>
      ) : null}
      {scriptUrl ? (
        <p className="mt-2 font-mono text-xs break-all text-muted-foreground" data-testid="text-login-failed-script">
          {scriptUrl}
        </p>
      ) : null}
      <Button asChild className="mt-6 rounded-md">
        <a href={homeHref()} data-testid="link-login-error-home">
          Back to home
        </a>
      </Button>
    </div>
  );
}

function toRouterPath(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function clerkFailureState(hostname = window.location.hostname) {
  const copy = clerkLoadFailureCopy(hostname);
  return (
    <LoginErrorState
      title={copy.title}
      body={copy.body}
      failedHost={copy.failedHost}
      scriptUrl={copy.scriptUrl}
    />
  );
}

function LoginErrorFallback(_props: ErrorFallbackProps) {
  return clerkFailureState();
}

function ClerkLoadTimeoutError() {
  return clerkFailureState();
}

function ClerkSignInExperience({ returnTo }: { returnTo: string }) {
  const auth = usePortalAuth();
  const [timedOut, setTimedOut] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    if (auth.isLoaded) {
      setTimedOut(false);
      setScriptFailed(false);
      return;
    }
    const timer = window.setTimeout(() => setTimedOut(true), CLERK_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [auth.isLoaded]);

  useEffect(() => {
    if (auth.isLoaded) return;
    const scriptUrl = clerkJsScriptUrl(window.location.hostname);
    if (!scriptUrl || typeof fetch !== "function") return;
    let cancelled = false;
    fetch(scriptUrl, { method: "GET", mode: "no-cors", cache: "no-store" }).catch(() => {
      if (!cancelled) setScriptFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.isLoaded]);

  if (auth.isLoaded && auth.isSignedIn) {
    return (
      <div data-testid="status-login-redirect">
        <LoginLoadingState label="Continuing to your dashboard…" />
        <Redirect to={toRouterPath(returnTo)} />
      </div>
    );
  }

  if (!auth.isLoaded && (timedOut || scriptFailed)) {
    return <ClerkLoadTimeoutError />;
  }

  if (!auth.isLoaded) {
    return <LoginLoadingState />;
  }

  return (
    <SignIn
      routing="path"
      path={`${basePath}/login`}
      forceRedirectUrl={returnTo}
      fallbackRedirectUrl={returnTo}
      withSignUp={false}
      fallback={<LoginLoadingState />}
      appearance={{
        elements: {
          footerAction: { display: "none" },
          footer: { display: "none" },
          socialButtonsBlockButton: { display: "none" },
          socialButtonsBlockButtonText: { display: "none" },
          socialButtonsProviderIcon: { display: "none" },
          dividerRow: { display: "none" },
        },
      }}
    />
  );
}

export function SignInPage() {
  const auth = usePortalAuth();
  const returnTo = loginReturnPath();

  if (!auth.clerkAvailable) {
    const copy = clerkConfigErrorCopy(auth.reason ?? "missing");
    return (
      <LoginFrame>
        <LoginIntro returnTo={returnTo} />
        <LoginErrorState title={copy.title} body={copy.body} />
      </LoginFrame>
    );
  }

  return (
    <LoginFrame>
      <LoginIntro returnTo={returnTo} />
      <ErrorBoundary FallbackComponent={LoginErrorFallback}>
        <ClerkSignInExperience returnTo={returnTo} />
      </ErrorBoundary>
    </LoginFrame>
  );
}

export default SignInPage;
