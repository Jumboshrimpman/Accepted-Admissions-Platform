import {
  VICTORIA_DISPLAY_NAME,
  VICTORIA_INTENDED_EMAIL,
  VICTORIA_PLACEHOLDER_EMAIL,
  VICTORIA_USER_ID,
} from "./college-consulting.ts";

/**
 * Victoria's profile, rates, grants, and past sessions stay in place.
 * Set this to true to show her in booking pickers and accept new bookings again.
 * Hour-pool rules are not controlled by this flag.
 */
export const VICTORIA_BOOKING_ENABLED = false;

export function isVictoriaCheckoutSlug(slug: string | null | undefined): boolean {
  const value = slug?.trim().toLowerCase() ?? "";
  return value.startsWith("sat-victoria-") || value.includes("college-consulting-victoria");
}

export function isVictoriaBookingProfile(profile: {
  name?: string | null;
  email?: string | null;
  userId?: string | null;
  tutorKey?: string | null;
  slug?: string | null;
}): boolean {
  if (profile.tutorKey === "victoria") return true;
  if (isVictoriaCheckoutSlug(profile.slug)) return true;
  if (profile.userId && profile.userId === VICTORIA_USER_ID) return true;
  if ((profile.name ?? "").trim() === VICTORIA_DISPLAY_NAME) return true;
  const email = profile.email?.trim().toLowerCase() ?? "";
  return email === VICTORIA_PLACEHOLDER_EMAIL || email === VICTORIA_INTENDED_EMAIL;
}

/** True when a booking, availability, or checkout request for Victoria must be refused. */
export function victoriaBookingRefused(profile: {
  name?: string | null;
  email?: string | null;
  userId?: string | null;
  tutorKey?: string | null;
  slug?: string | null;
}): boolean {
  return !VICTORIA_BOOKING_ENABLED && isVictoriaBookingProfile(profile);
}

export function satBookingTutorChoiceMessage(): string {
  return VICTORIA_BOOKING_ENABLED
    ? "Choose Eunice, Victoria, or Xavier for an SAT session."
    : "Choose Eunice or Xavier for an SAT session.";
}
