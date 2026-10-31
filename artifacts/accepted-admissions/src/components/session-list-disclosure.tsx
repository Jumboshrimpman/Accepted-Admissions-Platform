import { Button } from "@/components/ui/button";

export function SessionListDisclosure({
  canToggle,
  expanded,
  onToggle,
  testId = "session-list-show-more",
  collapsedLabel = "Show more",
  expandedLabel = "Show less",
  controlsId,
}: {
  canToggle: boolean;
  expanded: boolean;
  onToggle: () => void;
  testId?: string;
  collapsedLabel?: string;
  expandedLabel?: string;
  controlsId?: string;
}) {
  if (!canToggle) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      className="rounded-full"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      data-testid={testId}
    >
      {expanded ? expandedLabel : collapsedLabel}
    </Button>
  );
}
