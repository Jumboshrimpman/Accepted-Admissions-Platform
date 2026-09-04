import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Show } from "@clerk/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function publicApiPath(path: string): string {
  return resolvePublicPath(path);
}

export async function fetchPublicJson<T>(path: string): Promise<T> {
  const response = await fetch(publicApiPath(path), {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Public API request failed with status ${response.status}`);
  }
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
    throw new Error("Public API returned a non-JSON response");
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("Public API returned malformed JSON");
  }
}

export function publicAssetPath(path: string): string {
  return resolvePublicPath(path);
}

/** Resolve API-provided media URLs, including site-relative first-party assets. */
export function resolvePublicMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/") && !url.startsWith("//")) {
    return publicAssetPath(url);
  }
  return url;
}

export function resolvePublicPath(path: string, root = basePath): string {
  return `${root.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function setPublicMetadata({
  title,
  description,
  noIndex = false,
}: {
  title: string;
  description: string;
  noIndex?: boolean;
}) {
  document.title = title;
  setMeta("description", description);
  setMeta("robots", noIndex ? "noindex, nofollow" : "index, follow");
  setMeta("og:title", title, "property");
  setMeta("og:description", description, "property");
  setMeta("og:url", window.location.href.split("#")[0], "property");
  setMeta("og:type", "website", "property");
  setMeta("twitter:card", "summary_large_image");
  setMeta("twitter:title", title);
  setMeta("twitter:description", description);

  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = window.location.href.split(/[?#]/)[0].replace(/\/$/, "") || window.location.origin;
}

function setMeta(name: string, content: string, attribute: "name" | "property" = "name") {
  let meta = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, name);
    document.head.append(meta);
  }
  meta.content = content;
}

export function PublicSiteShell({
  children,
  eyebrow,
  title = "Accepted Admissions | SAT tutoring and admissions guidance",
  description = "Accepted Admissions offers focused SAT tutoring and private guidance for students deciding what support they need next.",
}: {
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const firstMobileLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setPublicMetadata({ title, description });
  }, [location, title, description]);

  useEffect(() => {
    if (menuOpen) firstMobileLink.current?.focus();
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="container mx-auto flex min-h-20 items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Accepted Admissions home">
            <img
              src={publicAssetPath("/logo.svg")}
              alt="Accepted Admissions"
              width="40"
              height="40"
              className="h-10 w-10 dark:invert"
            />
            <span className="hidden font-bold tracking-tight sm:inline">Accepted Admissions</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            <PublicNavLink href="/sat">SAT tutoring</PublicNavLink>
            <PublicNavLink href="/our-team">Meet the team</PublicNavLink>
            <PublicNavLink href="/past-success">Student stories</PublicNavLink>
            <PublicNavLink href="/client-request">Get guidance</PublicNavLink>
          </nav>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className="hidden text-xs text-muted-foreground md:inline">{eyebrow}</span>
            <Show when="signed-out">
              <Button asChild variant="ghost" className="hidden rounded-md sm:inline-flex">
                <Link href="/login" data-testid="button-header-sign-in">Client sign in</Link>
              </Button>
            </Show>
            <Show when="signed-in">
              <Button asChild variant="ghost" className="hidden rounded-md sm:inline-flex">
                <Link href="/portal" data-testid="button-header-portal">Open client portal</Link>
              </Button>
            </Show>
            <Button asChild className="rounded-md bg-primary px-4 text-sm text-primary-foreground sm:px-5">
              <Link href="/client-request" data-testid="link-header-guidance">
                Get guidance <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-1 rounded-md lg:hidden"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={menuOpen}
              aria-controls="public-mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        {menuOpen && (
          <nav id="public-mobile-navigation" className="border-t bg-background px-6 py-4 lg:hidden" aria-label="Mobile navigation">
            <div className="container mx-auto grid gap-1 sm:grid-cols-2">
              <PublicNavLink reference={firstMobileLink} href="/sat">SAT tutoring</PublicNavLink>
              <PublicNavLink href="/our-team">Meet the team</PublicNavLink>
              <PublicNavLink href="/past-success">Student stories</PublicNavLink>
              <PublicNavLink href="/client-request">Get guidance</PublicNavLink>
              <Show when="signed-out">
                <Link href="/login" data-testid="link-mobile-sign-in" className="rounded-md px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Client sign in</Link>
              </Show>
              <Show when="signed-in">
                <Link href="/portal" data-testid="link-mobile-portal" className="rounded-md px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Open client portal</Link>
              </Show>
            </div>
          </nav>
        )}
      </header>
      {children}
      <footer className="border-t bg-card">
        <div className="container mx-auto flex flex-col gap-6 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
             <img src={publicAssetPath("/logo.svg")} alt="" width="24" height="24" className="h-6 w-6 opacity-80 dark:invert" />
            <div>
              <p className="font-medium text-foreground">Accepted Admissions</p>
              <p className="mt-1 text-xs">Focused tutoring. Thoughtful guidance.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/sat" className="hover:text-foreground">SAT tutoring</Link>
            <Link href="/our-team" className="hover:text-foreground">Meet the team</Link>
            <Link href="/past-success" className="hover:text-foreground">Student stories</Link>
            <Link href="/client-request" className="hover:text-foreground">Get guidance</Link>
            <Link href="/login" className="hover:text-foreground">Client sign in</Link>
            <a href="mailto:info@acceptedadmissions.org" className="hover:text-foreground">
              info@acceptedadmissions.org
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PublicNavLink({
  href,
  children,
  reference,
}: {
  href: string;
  children: React.ReactNode;
  reference?: React.RefObject<HTMLAnchorElement | null>;
}) {
  const [location] = useLocation();
  const isActive = location === href || location.startsWith(`${href}/`);

  return (
    <Link ref={reference} data-testid={`link-nav-${href.slice(1) || "home"}`} className={`rounded-md px-4 py-2 text-sm transition-colors ${isActive ? "font-semibold text-accent underline decoration-2 underline-offset-8" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} href={href} aria-current={isActive ? "page" : undefined}>
      {children}
    </Link>
  );
}