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
