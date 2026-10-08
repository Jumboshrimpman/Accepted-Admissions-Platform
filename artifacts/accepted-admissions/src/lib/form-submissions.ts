export type FormSubmissionResolution = {
  id: string;
  resolvedAt?: string | Date | null;
  sourcePage?: string | null;
};

export function isFormSubmissionResolved(request: {
  resolvedAt?: string | Date | null;
}): boolean {
  return request.resolvedAt != null && request.resolvedAt !== "";
}

export function unresolvedFormSubmissions<T extends { resolvedAt?: string | Date | null }>(
  requests: readonly T[] | undefined,
): T[] {
  return (requests ?? []).filter((request) => !isFormSubmissionResolved(request));
}

export function unresolvedFormSubmissionLabel(count: number): string {
  return `${count} unresolved form submission${count === 1 ? "" : "s"}`;
}

/** Where the admin nav badge should go. Null when nothing is unresolved. */
export function unresolvedFormSubmissionHref<T extends FormSubmissionResolution>(
  requests: readonly T[] | undefined,
): string | null {
  const unresolved = unresolvedFormSubmissions(requests);
  if (unresolved.length === 0) return null;
  if (unresolved.length === 1) return `/admin#guidance-request-${unresolved[0]!.id}`;
  return "/admin#guidance-requests";
}

export function formSubmissionSourceLabel(sourcePage: string | null | undefined): string {
  if (!sourcePage || sourcePage === "/client-request") return "Client request";
  return sourcePage;
}
