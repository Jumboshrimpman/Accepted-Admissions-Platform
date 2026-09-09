export const PORTAL_HOME_HREF = "/portal";
export const PORTAL_BOOKING_SECTION_ID = "booking-schedule";
/** Client portal homepage booking calendar (same section as the public book-SAT flow). */
export const PORTAL_SAT_HREF = `${PORTAL_HOME_HREF}#${PORTAL_BOOKING_SECTION_ID}`;
export const PORTAL_SAT_PURCHASE_HREF = "/portal/sat";
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

export function portalPathname(location: string): string {
  return location.split(/[?#]/)[0] || "/";
}

export function isPortalHomePath(location: string): boolean {
  const path = portalPathname(location);
  return path === PORTAL_HOME_HREF || path === "/portal/curriculum";
}

export function scrollToPortalBooking(): boolean {
  const node = document.getElementById(PORTAL_BOOKING_SECTION_ID);
  if (!node) return false;
  node.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

export function goToPortalBooking(input: {
  location: string;
  setLocation: (href: string) => void;
}): void {
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}#${PORTAL_BOOKING_SECTION_ID}`,
    );
  }
  if (!isPortalHomePath(input.location)) {
    input.setLocation(PORTAL_HOME_HREF);
  }
  const delay = isPortalHomePath(input.location) ? 50 : 250;
  window.setTimeout(() => {
    if (!scrollToPortalBooking()) {
      input.setLocation(PORTAL_SAT_PURCHASE_HREF);
    }
  }, delay);
}
