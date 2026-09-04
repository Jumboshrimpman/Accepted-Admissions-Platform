import type { CurriculumBlock } from "@workspace/api-client-react";
import { BookOpen, ExternalLink, Target } from "lucide-react";

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function CurriculumBlockView({ block }: { block: CurriculumBlock }) {
  const { kind, config } = block;
  const libraryKind = textValue(config.libraryKind);
  const title = textValue(config.title || config.label);
  const url = textValue(config.url);
  const description = textValue(config.text);
  const html = textValue(config.html);

  if (libraryKind) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{title || "Assigned material"}</p>
          <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {libraryKind.replaceAll("_", " ")}
          </span>
        </div>
        {description && description !== title ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        {html ? (
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">{html}</div>
        ) : null}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Open resource
          </a>
        ) : null}
      </div>
    );
  }
  if (kind === "heading") return <h3 className="text-lg font-semibold">{textValue(config.text)}</h3>;
  if (kind === "rich_text") {
    return (
      <div className="prose prose-slate max-w-none whitespace-pre-wrap text-muted-foreground">
        {textValue(config.html || config.text)}
      </div>
    );
  }
  if (kind === "callout") {
    return (
      <div className="rounded-xl border border-accent/20 bg-accent/10 p-4">
        <BookOpen className="mr-2 inline h-4 w-4 text-accent" />
        {textValue(config.text)}
      </div>
    );
  }
  if (kind === "objectives") {
    const items = Array.isArray(config.items) ? config.items : [];
    return (
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2 text-sm">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (kind === "external_link" || kind === "file_link") {
    return (
      <a
        href={url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <ExternalLink className="h-4 w-4" />
        {title || "Open resource"}
      </a>
    );
  }
  if (title || description) {
    return (
      <div className="space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
    );
  }
  return null;
}
