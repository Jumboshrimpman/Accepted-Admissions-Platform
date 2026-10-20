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

/** Same files as APPROVED_PUBLIC_TEAM_PORTRAITS. First names match the booking card label. */
const BOOKING_CARD_PORTRAITS: Record<string, string> = {
  "Rosanna Kataja": "/media/team/rosanna-kataja.jpg",
  Rosanna: "/media/team/rosanna-kataja.jpg",
  "Xavier Morales": "/media/team/xavier-morales.jpg",
  Xavier: "/media/team/xavier-morales.jpg",
  "Eunice Chon": "/media/team/eunice-chon.jpg",
  Eunice: "/media/team/eunice-chon.jpg",
  "Sophia Lamas": "/media/team/sophia-lamas.jpg",
  Sophia: "/media/team/sophia-lamas.jpg",
  "Aurelia Finch": "/media/team/aurelia-finch.png",
  Aurelia: "/media/team/aurelia-finch.png",
  "Nika Raiffe": "/media/team/nika-raiffe.png",
  Nika: "/media/team/nika-raiffe.png",
  "Kya Brooks": "/media/team/kya-brooks.jpg",
  Kya: "/media/team/kya-brooks.jpg",
  "Michael Pecorara": "/media/team/michael-pecorara.jpg",
  Michael: "/media/team/michael-pecorara.jpg",
  "Kyle Englander": "/media/team/kyle-englander.jpg",
  Kyle: "/media/team/kyle-englander.jpg",
  "Daniel Salgado-Alvarez": "/media/team/daniel-salgado-alvarez.png",
  Daniel: "/media/team/daniel-salgado-alvarez.png",
  "Sama Noori": "/media/team/sama-noori.jpg",
  Sama: "/media/team/sama-noori.jpg",
};

export function portalBookingTutorPhoto(
  storedName: string,
  photoUrl: string | null | undefined,
): string | null {
  if (/^victoria\b/i.test(storedName.trim())) return PORTAL_VICTORIA_PHOTO_URL;
  const stored = photoUrl?.trim() ?? "";
  if (stored) return stored;
  return BOOKING_CARD_PORTRAITS[storedName.trim()] ?? null;
}

/** Checkout copy on the booking flow. Catalog rows are not rewritten. */
export function portalCheckoutCopy(text: string): string {
  return text.replace(
    /\b(Nika Raiffe|Victoria Wijerathnayapa|Xavier Morales|Eunice Chon)\b/g,
    (fullName) => portalTutorFirstName(fullName),
  );
}
