/** Live Wix marketing URLs that should land on in-app counterparts. */
export const LEGACY_PUBLIC_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "/book-online", to: "/sat" },
  { from: "/campus-tours", to: "/client-request" },
  { from: "/service-page/:rest*", to: "/client-request" },
];
