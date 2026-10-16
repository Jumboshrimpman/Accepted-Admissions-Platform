import type { ReactNode } from "react";
import { Link } from "wouter";
import { PublicSiteShell } from "@/components/public-site-shell";
import { DEFAULT_CONTACT_EMAIL } from "@/lib/public-site-content";

export const LEGAL_EFFECTIVE_DATE = "October 16, 2026";

export function LegalContactLink({ testId }: { testId?: string }) {
  return (
    <a
      href={`mailto:${DEFAULT_CONTACT_EMAIL}`}
      data-testid={testId}
      className="font-medium text-primary underline underline-offset-2"
    >
      {DEFAULT_CONTACT_EMAIL}
    </a>
  );
}

export function LegalPage({
  testId,
  eyebrow,
  title,
  description,
  heading,
  lede,
  toc,
  children,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  description: string;
  heading: string;
  lede: string;
  toc: Array<{ href: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <PublicSiteShell eyebrow={eyebrow} title={title} description={description}>
      <main data-testid={testId}>
        <article className="border-b">
          <div className="container mx-auto max-w-3xl break-words px-6 py-14 sm:py-16 md:py-20">
            <p className="font-metadata text-accent">{eyebrow}</p>
            <h1 className="font-display mt-4 text-4xl tracking-tight sm:text-5xl">{heading}</h1>
            <p className="mt-4 text-sm text-muted-foreground">Effective {LEGAL_EFFECTIVE_DATE}</p>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{lede}</p>
            <nav aria-label="On this page" className="mt-8">
              <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {toc.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="font-medium text-primary underline-offset-2 hover:underline">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-12 space-y-10">{children}</div>
          </div>
        </article>
      </main>
    </PublicSiteShell>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-display text-2xl tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalPlaceholder({
  id,
  title,
  testId,
  children,
}: {
  id: string;
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28" data-testid={testId}>
      <div className="rounded-lg border border-dashed border-accent bg-accent/10 p-5">
        <p className="font-metadata text-accent">Placeholder — owner to complete</p>
        <h2 className="font-display mt-3 text-2xl tracking-tight text-foreground sm:text-3xl">{title}</h2>
        <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

export function LegalTextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const className = "font-medium text-primary underline underline-offset-2";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
