import { Link } from "wouter";
import { Show } from "@clerk/react";
import { ArrowUpRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function publicApiPath(path: string): string {
  return `${basePath}${path}`;
}

export function PublicSiteShell({
  children,
  eyebrow,
}: {
  children: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="container mx-auto flex h-20 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <img
              src={`${basePath}/logo.svg`}
              alt="Accepted Admissions"
              className="h-10 w-10 rounded-xl shadow-sm"
            />
            <span className="font-bold tracking-tight">Accepted Admissions</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            <Link className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="/sat">SAT tutoring</Link>
            <Link className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="/our-team">Our team</Link>
            <Link className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="/past-success">Past success</Link>
            <Link className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" href="/client-request">Client request</Link>
          </nav>
          <div className="flex items-center gap-2">
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
              <Button className="rounded-full bg-primary px-5 text-primary-foreground">
                Start a conversation <ArrowUpRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Menu className="ml-1 h-5 w-5 text-muted-foreground lg:hidden" aria-hidden="true" />
          </div>
        </div>
        <div className="container mx-auto flex gap-1 overflow-x-auto px-6 pb-3 lg:hidden">
          <Link className="whitespace-nowrap rounded-full bg-muted px-3 py-1.5 text-xs font-medium" href="/sat">SAT tutoring</Link>
          <Link className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground" href="/our-team">Our team</Link>
          <Link className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground" href="/past-success">Past success</Link>
          <Link className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground" href="/client-request">Client request</Link>
        </div>
      </header>
      {children}
      <footer className="border-t bg-card">
        <div className="container mx-auto flex flex-col gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <img src={`${basePath}/logo.svg`} alt="" className="h-6 w-6 rounded-md opacity-50 grayscale" />
            <span>Accepted Admissions</span>
          </div>
          <div className="flex gap-5">
            <Link href="/sat" className="hover:text-foreground">SAT tutoring</Link>
            <Link href="/client-request" className="hover:text-foreground">Client request</Link>
            <Link href="/login" className="hover:text-foreground">Portal sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}