const PLACEHOLDER_DISPLAY_NAME = /^accepted admissions user$/i;

export function isPlaceholderDisplayName(name?: string | null): boolean {
  return !name?.trim() || PLACEHOLDER_DISPLAY_NAME.test(name.trim());
}

export function portalDisplayName(
  apiName?: string | null,
  clerkName?: string | null,
  fallback = "Account",
): string {
  for (const name of [apiName, clerkName]) {
    if (name?.trim() && !isPlaceholderDisplayName(name)) {
      return name.trim();
    }
  }
  return fallback;
}

export function portalAvatarUrl(
  apiUrl?: string | null,
  clerkUrl?: string | null,
): string | null {
  return apiUrl?.trim() || clerkUrl?.trim() || null;
}
