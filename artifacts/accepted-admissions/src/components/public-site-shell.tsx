import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Show } from "@clerk/react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function publicApiPath(path: string): string {
  return resolvePublicPath(path);
}

export function publicAssetPath(path: string): string {
  return resolvePublicPath(path);
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
  title = "Accepted Admissions | Personalized academic guidance",
  description = "Accepted Admissions provides thoughtful SAT tutoring and admissions guidance tailored to each student’s goals.",
}: {
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setPublicMetadata({ title, description });
  }, [location, title, description]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="container mx-auto flex min-h-20 items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Accepted Admissions home">
            <img
              src={publicAssetPath("/logo.svg")}
              alt="Accepted Admissions"
              width="40"
              height="40"
              className="h-10 w-10 rounded-xl shadow-sm"
            />
            <span className="hidden font-bold tracking-tight sm:inline">Accepted Admissions</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            <PublicNavLink href="/sat">SAT tutoring</PublicNavLink>
            <PublicNavLink href="/our-team">Our team</PublicNavLink>
            <PublicNavLink href="/past-success">Past success</PublicNavLink>
            <PublicNavLink href="/client-request">Client request</PublicNavLink>
          </nav>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className="hidden text-xs text-muted-foreground md:inline">{eyebrow}</span>
            <Show when="signed-out">
              <Link href="/login">
                <Button variant="ghost" className="hidden rounded-full sm:inline-flex">Sign in</Button>
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/portal">
                <Button variant="ghost" className="hidden rounded-full sm:inline-flex">Portal</Button>
              </Link>
            </Show>
            <Link href="/client-request">
              <Button className="rounded-full bg-primary px-4 text-sm text-primary-foreground sm:px-5">
                Start a conversation <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-1 rounded-full lg:hidden"
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
              <PublicNavLink href="/sat">SAT tutoring</PublicNavLink>
              <PublicNavLink href="/our-team">Our team</PublicNavLink>
              <PublicNavLink href="/past-success">Past success</PublicNavLink>
              <PublicNavLink href="/client-request">Client request</PublicNavLink>
              <Show when="signed-out">
                <Link href="/login" className="rounded-full px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Portal sign in</Link>
              </Show>
              <Show when="signed-in">
                <Link href="/portal" className="rounded-full px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Open portal</Link>
              </Show>
            </div>
          </nav>
        )}
      </header>
      {children}
      <footer className="border-t bg-card">
        <div className="container mx-auto flex flex-col gap-6 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <img src={publicAssetPath("/logo.svg")} alt="" width="24" height="24" className="h-6 w-6 rounded-md opacity-50 grayscale" />
            <span>Accepted Admissions</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/sat" className="hover:text-foreground">SAT tutoring</Link>
            <Link href="/our-team" className="hover:text-foreground">Our team</Link>
            <Link href="/past-success" className="hover:text-foreground">Past success</Link>
            <Link href="/client-request" className="hover:text-foreground">Client request</Link>
            <Link href="/login" className="hover:text-foreground">Portal sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PublicNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href={href}>
      {children}
    </Link>
  );
}