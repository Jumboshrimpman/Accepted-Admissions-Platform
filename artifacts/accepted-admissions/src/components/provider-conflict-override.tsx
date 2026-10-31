import { Button } from "@/components/ui/button";
import { providerOnlyScheduleConflicts } from "@/lib/provider-conflict-override";

export function ProviderConflictOverridePanel({
  conflicts,
  editing,
  pending,
  onOverride,
}: {
  conflicts: readonly string[];
  editing: boolean;
  pending: boolean;
  onOverride: () => void;
}) {
  if (!providerOnlyScheduleConflicts(conflicts)) return null;
  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
      data-testid="provider-conflict-override"
      role="status"
    >
      <p className="font-medium">The tutor&apos;s calendar is busy at this time.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {conflicts.map((conflict) => (
          <li key={conflict}>{conflict}</li>
        ))}
      </ul>
      <Button
        type="button"
        className="mt-3"
        variant="outline"
        disabled={pending}
        data-testid="button-override-provider-conflict"
        onClick={onOverride}
      >
        {editing
          ? "Save anyway — the tutor's calendar is busy at this time"
          : "Create anyway — the tutor's calendar is busy at this time"}
      </Button>
    </div>
  );
}
