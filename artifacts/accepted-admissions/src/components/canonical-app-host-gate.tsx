import { useLayoutEffect, useState, type ReactNode } from "react";
import { canonicalAppHostUrl, type LocationLike } from "@/lib/canonical-app-host";

export function CanonicalAppHostGate({
  children,
  location = typeof window === "undefined" ? null : window.location,
  replace = (url: string) => {
    window.location.replace(url);
  },
}: {
  children: ReactNode;
  location?: LocationLike | null;
  replace?: (url: string) => void;
}) {
  const [destination] = useState(() =>
    location ? canonicalAppHostUrl(location) : null,
  );

  useLayoutEffect(() => {
    if (destination) replace(destination);
  }, [destination, replace]);

  if (destination) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground"
        data-testid="status-login-loading"
        role="status"
      >
        <p>Continuing on the app host…</p>
      </div>
    );
  }

  return <>{children}</>;
}
