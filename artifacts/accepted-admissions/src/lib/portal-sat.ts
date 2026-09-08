export const PORTAL_SAT_HREF = "/portal/sat";
export const PORTAL_SAT_BOOK_LABEL = "Book SAT";
export const PORTAL_SAT_PURCHASE_LABEL = "Purchase SAT hours";
export const PORTAL_SAT_TUTOR_HREF = "/tutor";
export const PORTAL_SAT_TUTOR_DENIED_TITLE = "SAT booking is for students";
export const PORTAL_SAT_TUTOR_DENIED_BODY =
  "Tutors do not purchase or book SAT credits. Open the tutor workspace to teach and review assigned sessions.";

/** In-portal SAT buy/book is student/client commerce only. */
export function canPurchaseOrBookSatCredits(
  role: string | null | undefined,
): boolean {
  return role === "student";
}

export function canSeePortalSatNav(role: string | null | undefined): boolean {
  return role === "student";
}
