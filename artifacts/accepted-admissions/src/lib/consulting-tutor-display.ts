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
