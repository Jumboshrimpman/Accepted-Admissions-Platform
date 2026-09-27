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

export function shouldAdoptLoserCalendarConnection(
  winner: {
    status?: string | null;
    encryptedRefreshToken?: string | null;
  } | null,
  loser: { encryptedRefreshToken?: string | null } | null,
): boolean {
  // A disconnected canonical row may still hold a valid refresh token.
  // Never replace that grant with a retired duplicate's token.
  return Boolean(
    connectionHasRefreshToken(loser) && !connectionHasRefreshToken(winner),
  );
}
