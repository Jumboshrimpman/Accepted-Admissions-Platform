import { Button } from "@/components/ui/button";

export function SessionListDisclosure({
  canToggle,
  expanded,
  onToggle,
  testId = "session-list-show-more",
}: {
  canToggle: boolean;
  expanded: boolean;
  onToggle: () => void;
  testId?: string;
}) {
  if (!canToggle) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      className="rounded-full"
      onClick={onToggle}
      aria-expanded={expanded}
      data-testid={testId}
    >
      {expanded ? "Show less" : "Show more"}
    </Button>
  );
}
