import { Button } from "@/components/ui/button";

export function SessionListDisclosure({
  canToggle,
  expanded,
  onToggle,
}: {
  canToggle: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!canToggle) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      className="rounded-full"
      onClick={onToggle}
      aria-expanded={expanded}
      data-testid="session-list-show-more"
    >
      {expanded ? "Show less" : "Show more"}
    </Button>
  );
}
