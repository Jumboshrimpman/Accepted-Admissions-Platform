type AnalyticsData = Record<string, string | number | boolean>;

export type CalendarConnectionLocation =
  | "portal_dashboard"
  | "tutor_dashboard"
  | "admin_dashboard";

export type CalendarConnectionOutcome =
  | "popup_launched"
  | "popup_blocked"
  | "connected"
  | "cancelled"
  | "rejected"
  | "failed"
  | "misconfigured"
  | "redirect_mismatch"
  | "unavailable"
  | "expired"
  | "disconnected"
  | "disconnect_failed";

export type CalendarConnectionRole =
  | "administrator"
  | "tutor"
  | "student"
  | "viewer";

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    // Replit injects this tracker into published website artifacts when
    // Project Analytics is enabled; app code must not load or configure it.
    window.umami?.track(name, data);
  } catch {
    // Analytics must never break application behavior.
  }
}

export function trackCalendarConnection(
  role: CalendarConnectionRole,
  location: CalendarConnectionLocation,
  outcome: CalendarConnectionOutcome,
): void {
  trackEvent("calendar_connection", { role, location, outcome });
}