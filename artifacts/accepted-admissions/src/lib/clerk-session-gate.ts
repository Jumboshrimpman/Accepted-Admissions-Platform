export const CLERK_SIGNOUT_GRACE_MS = 20_000;
const ESTABLISHED_KEY = "aa.clerk.established";

let explicitSignOut = false;
let establishedMemory = false;

export function markClerkSessionEstablished(): void {
  explicitSignOut = false;
  establishedMemory = true;
  try {
    sessionStorage.setItem(ESTABLISHED_KEY, "1");
  } catch {
    // Private mode can reject storage. The in-memory flag still covers this document.
  }
}

export function markClerkExplicitSignOut(): void {
  explicitSignOut = true;
  establishedMemory = false;
  try {
    sessionStorage.removeItem(ESTABLISHED_KEY);
  } catch {
    // Ignore storage failures. The memory flag is what stops the hold.
  }
}

export function clerkExplicitSignOut(): boolean {
  return explicitSignOut;
}

export function hasEstablishedClerkSession(): boolean {
  if (explicitSignOut) return false;
  if (establishedMemory) return true;
  try {
    return sessionStorage.getItem(ESTABLISHED_KEY) === "1";
  } catch {
    return false;
  }
}

export function resetClerkSessionGateForTests(): void {
  explicitSignOut = false;
  establishedMemory = false;
  try {
    sessionStorage.removeItem(ESTABLISHED_KEY);
  } catch {
    // Ignore.
  }
}

export function shouldHoldSignedInShell(input: {
  established: boolean;
  explicitSignOut: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  tokenReconnecting: boolean;
  signedOutForMs: number;
}): boolean {
  if (input.explicitSignOut || !input.established) return false;
  // A loaded, signed-out Clerk session is a real sign-out. The grace period
  // still applies when a token refresh is marked reconnecting — a resolved
  // null from getToken() must not pin the shell open.
  if (input.isLoaded && !input.isSignedIn) {
    return input.signedOutForMs < CLERK_SIGNOUT_GRACE_MS;
  }
  if (!input.isLoaded || input.tokenReconnecting) return true;
  return false;
}

export type ClerkSignedInMode = "children" | "signed-out" | "checking" | "reconnecting" | "hold";

export function clerkSignedInGate(auth: {
  clerkAvailable: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  holdSignedInShell?: boolean;
  reconnecting?: boolean;
}): ClerkSignedInMode {
  if (auth.holdSignedInShell) return "hold";
  if (auth.clerkAvailable && !auth.isLoaded) {
    return auth.reconnecting ? "reconnecting" : "checking";
  }
  if (!auth.isSignedIn) return "signed-out";
  return "children";
}

export function clerkSignedOutSuppressed(auth: {
  clerkAvailable: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  holdSignedInShell?: boolean;
}): boolean {
  if (auth.holdSignedInShell) return true;
  if (auth.clerkAvailable && !auth.isLoaded) return true;
  if (auth.isSignedIn) return true;
  return false;
}
