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

export function shouldAdoptLoserCalendarConnection(
  winner: {
    status?: string | null;
    encryptedRefreshToken?: string | null;
  } | null,
  loser: { encryptedRefreshToken?: string | null } | null,
): boolean {
  return Boolean(
    connectionHasRefreshToken(loser) && !connectionLooksConnected(winner),
  );
}
