import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { missedPreworkEmptyCopy } from "@/lib/session-result-fill";

export type MissedPreworkItem = {
  skill: string;
  prompt?: string | null;
};

export function MissedOnPreworkList({
  mistakes,
  reviewHref,
  submitted = false,
}: {
  mistakes: MissedPreworkItem[];
  reviewHref?: string | null;
  submitted?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background p-3" data-testid="missed-on-prework">
      <p className="text-sm font-medium">Missed on pre-work</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {submitted && mistakes.length === 0
          ? "This pre-work had no incorrect items."
          : "Use these incorrect items as the session’s review and lesson focus."}
      </p>
      {mistakes.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {missedPreworkEmptyCopy(submitted)}
        </p>
      ) : (
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm">
          {mistakes.map((item, index) => (
            <li key={`${item.skill}-${index}`}>
              <span className="font-medium">{item.skill}</span>
              {item.prompt ? <span className="text-muted-foreground"> — {item.prompt}</span> : null}
            </li>
          ))}
        </ol>
      )}
      {reviewHref ? (
        <Button asChild size="sm" variant="secondary" className="mt-3">
          <Link href={reviewHref}>Review attempt</Link>
        </Button>
      ) : null}
    </div>
  );
}
