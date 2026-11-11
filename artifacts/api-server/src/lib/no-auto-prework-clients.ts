/**
 * Clients who never get automatic pre-work. Sama assigns their pre-work by hand
 * only when she explicitly asks for it. In-session sets still generate.
 */
export const MICHELLE_MAKAREM_USER_ID = "b21bc32a-82c3-4252-a702-daa3fcdd23af";

const NO_AUTO_PREWORK_CLIENT_USER_IDS: ReadonlySet<string> = new Set([MICHELLE_MAKAREM_USER_ID]);

export function skipsAutoPrework(session: { clientUserId?: string | null }): boolean {
  const id = session.clientUserId?.trim().toLowerCase();
  return Boolean(id && NO_AUTO_PREWORK_CLIENT_USER_IDS.has(id));
}
