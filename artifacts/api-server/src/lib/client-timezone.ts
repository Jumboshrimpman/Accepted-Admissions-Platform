export const DEFAULT_USER_TIMEZONE = "America/New_York";
export const MICHELLE_TIMEZONE = "Asia/Dubai";
export const MICHELLE_TIMEZONE_EMAILS = [
  "makaremmichelle7@gmail.com",
  "michaelmakarem@gmail.com",
] as const;

export type TimezoneSource = "default" | "admin" | "browser";

export function isValidIanaTimeZone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeIanaTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return isValidIanaTimeZone(trimmed) ? trimmed : undefined;
}

export function normalizeTimezoneSource(value: unknown): TimezoneSource {
  return value === "admin" || value === "browser" ? value : "default";
}

export function shouldPersistDetectedTimezone(source?: string | null): boolean {
  return normalizeTimezoneSource(source) === "default";
}
