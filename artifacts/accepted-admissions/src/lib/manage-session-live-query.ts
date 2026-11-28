/**
 * Manage session stays open while the student works.
 * The full session GET still refreshes on focus. The 12-second poll uses
 * `/prework-status` so it does not re-run slide attachment on every tick.
 * Background tabs do not poll.
 */
export const MANAGE_SESSION_POLL_MS = 12_000;

export const manageSessionRefreshQuery = {
  staleTime: 0,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

export const manageSessionLiveQuery = {
  ...manageSessionRefreshQuery,
  refetchInterval: MANAGE_SESSION_POLL_MS,
  refetchIntervalInBackground: false,
} as const;
