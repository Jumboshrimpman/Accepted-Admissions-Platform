/**
 * Manage session stays open while the student works. Refetch on focus and on
 * a short interval so a submission shows up without a hard reload. Background
 * tabs do not poll.
 */
export const MANAGE_SESSION_POLL_MS = 12_000;

export const manageSessionLiveQuery = {
  staleTime: 0,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchInterval: MANAGE_SESSION_POLL_MS,
  refetchIntervalInBackground: false,
} as const;
