export function connectionHasRefreshToken(connection: {
  encryptedRefreshToken?: string | null;
} | null | undefined): boolean {
  return Boolean(connection?.encryptedRefreshToken);
}

export function connectionLooksConnected(connection: {
  status?: string | null;
  encryptedRefreshToken?: string | null;
} | null | undefined): boolean {
  return (
    connection?.status === "connected" && connectionHasRefreshToken(connection)
  );
}

export type StoredGoogleCalendarDiagnostic = {
  connectionStatus: string | null;
  hasRefreshToken: boolean;
  hasAccessToken: boolean;
  accessTokenExpiresAt: string | null;
  /** True only when no refresh token is stored. A revoked token still needs Google consent, which only a refresh attempt can prove. */
  googleReconnectRequired: boolean;
};

/** Connection facts safe to log or show to an admin. Never includes token ciphertext. */
export function describeStoredGoogleCalendarConnection(
  connection: {
    status?: string | null;
    encryptedRefreshToken?: string | null;
    encryptedAccessToken?: string | null;
    accessTokenExpiresAt?: Date | null;
  } | null | undefined,
): StoredGoogleCalendarDiagnostic {
  const hasRefreshToken = connectionHasRefreshToken(connection);
  const hasAccessToken = Boolean(connection?.encryptedAccessToken);
  const expiresAt = connection?.accessTokenExpiresAt ?? null;
  return {
    connectionStatus: connection?.status ?? null,
    hasRefreshToken,
    hasAccessToken,
    accessTokenExpiresAt:
      expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
        ? expiresAt.toISOString()
        : null,
    googleReconnectRequired: !hasRefreshToken,
  };
}

/**
 * Ciphertext to store after connect or re-consent.
 * Google omits `refresh_token` on some re-consents; never replace a stored grant with empty.
 */
export function encryptedRefreshTokenAfterConnect(
  existingEncrypted: string | null | undefined,
  incomingRefreshToken: string | null | undefined,
  encrypt: (value: string) => string,
): string | null {
  const incoming = typeof incomingRefreshToken === "string" ? incomingRefreshToken.trim() : "";
  if (incoming) return encrypt(incoming);
  const existing = typeof existingEncrypted === "string" ? existingEncrypted.trim() : "";
  return existing || null;
}

/**
 * A disconnected row that still has a calendar id and refresh token can be
 * marked connected again after a successful refresh or API call.
 * User-initiated disconnect clears `calendarId` and must not self-heal.
 */
export function shouldSelfHealGoogleCalendarConnection(connection: {
  status?: string | null;
  calendarId?: string | null;
  encryptedRefreshToken?: string | null;
} | null | undefined): boolean {
  return Boolean(
    connection &&
      connection.status !== "connected" &&
      connection.calendarId &&
      connectionHasRefreshToken(connection),
  );
}

/**
 * Boot and identity cleanup must not leave a stored refresh token looking disconnected.
 * A tutor-initiated disconnect clears the token, so it does not match.
 */
export function storedRefreshTokenKeepsCalendarConnected(connection: {
  status?: string | null;
  calendarId?: string | null;
  encryptedRefreshToken?: string | null;
} | null | undefined): boolean {
  return Boolean(connection && connectionHasRefreshToken(connection));
}

/**
 * Moving a duplicate's grant onto the canonical profile. A refresh token is a
 * live grant, even if the source row was previously marked disconnected.
 */
export function adoptedGoogleCalendarConnectionStatus(from: {
  status?: string | null;
  encryptedRefreshToken?: string | null;
} | null | undefined): "connected" | "disconnected" {
  if (connectionHasRefreshToken(from)) return "connected";
  return from?.status === "connected" ? "connected" : "disconnected";
}

const XAVIER_OWN_GMAILS = new Set([
  "xaver.rmz6@gmail.com",
  "xavier.rmz6@gmail.com",
]);
const ADMIN_CALENDAR_GMAIL = "admin@acceptedadmissions.org";

export type CalendarGrantChoice = {
  status?: string | null;
  encryptedRefreshToken?: string | null;
  connectedAt?: Date | string | null;
  googleAccountEmail?: string | null;
};

function grantAccountEmail(connection: CalendarGrantChoice | null | undefined): string {
  return connection?.googleAccountEmail?.trim().toLowerCase() ?? "";
}

function connectedAtMillis(connection: CalendarGrantChoice | null | undefined): number | null {
  if (!connection?.connectedAt) return null;
  const millis = new Date(connection.connectedAt).getTime();
  return Number.isNaN(millis) ? null : millis;
}

/**
 * Whether the duplicate's Google grant should replace the keeper's.
 * A missing keeper token always yields. When both tokens exist, Xavier's own
 * Gmail beats admin@acceptedadmissions.org, and otherwise the newer
 * connected_at wins. Equal or unknown times stay put so a rerun is a no-op.
 */
export function shouldAdoptLoserCalendarConnection(
  winner: CalendarGrantChoice | null,
  loser: CalendarGrantChoice | null,
): boolean {
  if (!connectionHasRefreshToken(loser)) return false;
  if (!connectionHasRefreshToken(winner)) return true;

  const winnerEmail = grantAccountEmail(winner);
  const loserEmail = grantAccountEmail(loser);
  const winnerIsXavier = XAVIER_OWN_GMAILS.has(winnerEmail);
  const loserIsXavier = XAVIER_OWN_GMAILS.has(loserEmail);
  const winnerIsAdmin = winnerEmail === ADMIN_CALENDAR_GMAIL;
  const loserIsAdmin = loserEmail === ADMIN_CALENDAR_GMAIL;
  if (loserIsXavier && winnerIsAdmin) return true;
  if (winnerIsXavier && loserIsAdmin) return false;

  const winnerAt = connectedAtMillis(winner);
  const loserAt = connectedAtMillis(loser);
  if (loserAt == null) return false;
  if (winnerAt == null) return true;
  return loserAt > winnerAt;
}
