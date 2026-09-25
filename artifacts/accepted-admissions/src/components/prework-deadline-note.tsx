export function PreworkDeadlineNote({
  label,
  testId,
}: {
  label: string | null | undefined;
  testId?: string;
}) {
  if (!label) return null;
  return (
    <p
      className="mt-2 w-fit max-w-full rounded-md bg-amber-50 px-2.5 py-1 text-sm font-semibold leading-snug text-amber-950 ring-1 ring-inset ring-amber-200"
      data-testid={testId}
    >
      {label}
    </p>
  );
}
