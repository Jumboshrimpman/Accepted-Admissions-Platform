import { Link } from "wouter";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminSessionQuizLinks } from "@/lib/admin-session-quiz-links";

type SessionAssignment = Parameters<typeof adminSessionQuizLinks>[0];

/**
 * Admin-only replacement for the full "Homework questions for this session"
 * listing: one compact row per quiz with links to open it.
 */
export function AdminSessionQuizLinks({ assignments }: { assignments: SessionAssignment }) {
  const links = adminSessionQuizLinks(assignments);
  return (
    <div className="space-y-2" data-testid="admin-session-quiz-links">
      <p className="text-sm font-semibold">Quizzes for this session</p>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quizzes are attached to this session yet.</p>
      ) : (
        links.map((link) => (
          <div
            key={link.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2"
            data-testid={`admin-session-quiz-${link.kind}`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{link.kindLabel}</Badge>
                <Badge variant={link.status === "published" ? "default" : "outline"}>{link.status}</Badge>
                <span className="text-xs text-muted-foreground">{link.questionCount} questions</span>
              </div>
              <p className="mt-1 truncate text-sm">{link.title}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={link.openHref}>{link.openLabel}</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={link.adminHref}>
                  Questions &amp; answers <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
