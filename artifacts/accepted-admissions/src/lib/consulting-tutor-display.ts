/** Square, face-centered crop. object-center keeps mobile object-cover on the face. */
export const CONSULTING_TUTOR_PHOTO_CLASS =
  "aspect-square h-28 w-28 max-h-28 max-w-28 shrink-0 rounded-2xl object-cover object-center sm:h-16 sm:w-16 sm:max-h-16 sm:max-w-16";

/** Nika and Victoria are shown by first name. Other tutors keep the name they were given. */
export function consultingCreditsTutorLabel(name: string): string {
  const trimmed = name.trim();
  if (/^nika\b/i.test(trimmed)) return "Nika";
  if (/^victoria\b/i.test(trimmed)) return "Victoria";
  return trimmed;
}

/** Portal booking cards show the first name only. Stored names stay unchanged. */
export function portalTutorFirstName(storedName: string): string {
  const trimmed = storedName.trim();
  const first = trimmed.split(/\s+/)[0] ?? "";
  return first || trimmed;
}

/** Sama's square headshot. The public site keeps /media/team/victoria.jpg. */
export const PORTAL_VICTORIA_PHOTO_URL = "/media/portal/victoria.jpg";

export function portalBookingTutorPhoto(
  storedName: string,
  photoUrl: string | null | undefined,
): string | null {
  if (/^victoria\b/i.test(storedName.trim())) return PORTAL_VICTORIA_PHOTO_URL;
  const stored = photoUrl?.trim() ?? "";
  return stored || null;
}

/** Checkout copy on the booking flow. Catalog rows are not rewritten. */
export function portalCheckoutCopy(text: string): string {
  return text.replace(
    /\b(Nika Raiffe|Victoria Wijerathnayapa|Xavier Morales|Eunice Chon)\b/g,
    (fullName) => portalTutorFirstName(fullName),
  );
}
