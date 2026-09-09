import {
  formatMissClusters,
  formatSectionBreakdown,
  isFillerAnalysis,
  usefulFocusLabels,
  type AlertMissCluster,
  type AlertSectionBreakdown,
} from "@/lib/submission-alert-display";

export function TutorAnalysisBrief({
  analysisPreview,
  sessionOpener,
  skipRehash = [],
  sectionBreakdown = [],
  missClusters = [],
  nextFocus = [],
  compact = false,
}: {
  analysisPreview?: string | null;
  sessionOpener?: string | null;
  skipRehash?: string[];
  sectionBreakdown?: AlertSectionBreakdown[];
  missClusters?: AlertMissCluster[];
  nextFocus?: string[];
  compact?: boolean;
}) {
  const opener = sessionOpener?.trim() || (isFillerAnalysis(analysisPreview) ? null : analysisPreview?.trim() || null);
  const focus = usefulFocusLabels(nextFocus);
  const clusterLine = formatMissClusters(missClusters);
  const sectionLine = formatSectionBreakdown(sectionBreakdown);
  const skipLine = skipRehash.slice(0, 3).join(" · ");
  if (!opener && !sectionLine && !clusterLine && !skipLine && focus.length === 0) {
    return null;
  }

  return (
    <div className={compact ? "mt-2 space-y-1.5" : "space-y-2"} data-testid="tutor-analysis-brief">
      {opener ? (
        <p className={compact ? "text-sm text-foreground/80" : "text-sm"}>{opener}</p>
      ) : null}
      {sectionLine ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Sections:</span> {sectionLine}
        </p>
      ) : null}
      {clusterLine ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Misses:</span> {clusterLine}
        </p>
      ) : null}
      {skipLine ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Skip:</span> {skipLine}
        </p>
      ) : null}
      {focus.length > 0 && !clusterLine ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Focus:</span> {focus.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
