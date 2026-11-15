import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Students whose pay / book-with-a-tutor section starts collapsed on the
 * dashboard. Keyed by stable portal user IDs from the database:
 * - Michelle Makarem (makaremmichelle7@gmail.com)
 * - Sophia Sleiman (sophiasleiman13@gmail.com)
 * Every other student keeps the section open. Booking, payment, and credits
 * logic is unchanged; this only wraps the section in an expandable header.
 */
export const COLLAPSED_BOOKING_STUDENT_IDS: ReadonlySet<string> = new Set([
  "b21bc32a-82c3-4252-a702-daa3fcdd23af",
  "bf530aa6-faaa-43df-b3cf-140026f3313e",
]);

export function bookingSectionStartsCollapsed(portalUserId: string | null | undefined): boolean {
  return Boolean(portalUserId) && COLLAPSED_BOOKING_STUDENT_IDS.has(portalUserId!);
}

export function CollapsibleBookingSection({
  collapsed,
  title,
  children,
}: {
  collapsed: boolean;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!collapsed) return <>{children}</>;
  return (
    <details
      className="group rounded-2xl border bg-card"
      data-testid="collapsible-booking-section"
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-base font-semibold sm:px-6 [&::-webkit-details-marker]:hidden"
        data-testid="collapsible-booking-summary"
      >
        <span>{title}</span>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors group-hover:bg-primary/90"
          data-testid="collapsible-booking-toggle"
        >
          {open ? "Hide" : "Press to Book"}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="p-2 sm:p-3">{children}</div>
    </details>
  );
}
