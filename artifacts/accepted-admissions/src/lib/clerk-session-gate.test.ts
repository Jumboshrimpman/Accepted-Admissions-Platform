import assert from "node:assert/strict";
import test from "node:test";
import {
  CLERK_SIGNOUT_GRACE_MS,
  clerkSignedInGate,
  clerkSignedOutSuppressed,
  hasEstablishedClerkSession,
  markClerkExplicitSignOut,
  markClerkSessionEstablished,
  resetClerkSessionGateForTests,
  shouldHoldSignedInShell,
} from "./clerk-session-gate.ts";

test("a token blip keeps an established student session mounted", () => {
  const established = {
    established: true,
    explicitSignOut: false,
    isLoaded: false,
    isSignedIn: false,
    tokenReconnecting: true,
    signedOutForMs: CLERK_SIGNOUT_GRACE_MS + 5_000,
  };
  assert.equal(shouldHoldSignedInShell(established), true);
  assert.equal(
    clerkSignedInGate({
      clerkAvailable: true,
      isLoaded: false,
      isSignedIn: false,
      holdSignedInShell: true,
      reconnecting: true,
    }),
    "hold",
  );
  assert.equal(
    clerkSignedOutSuppressed({
      clerkAvailable: true,
      isLoaded: true,
      isSignedIn: false,
      holdSignedInShell: true,
    }),
    true,
  );
});

test("the first visit shows checking, then reconnecting, and never a blank signed-in tree", () => {
  assert.equal(
    clerkSignedInGate({ clerkAvailable: true, isLoaded: false, isSignedIn: false }),
    "checking",
  );
  assert.equal(
    clerkSignedInGate({
      clerkAvailable: true,
      isLoaded: false,
      isSignedIn: false,
      reconnecting: true,
    }),
    "reconnecting",
  );
  assert.equal(
    clerkSignedInGate({ clerkAvailable: true, isLoaded: true, isSignedIn: true }),
    "children",
  );
  assert.equal(
    shouldHoldSignedInShell({
      established: false,
      explicitSignOut: false,
      isLoaded: false,
      isSignedIn: false,
      tokenReconnecting: true,
      signedOutForMs: 0,
    }),
    false,
  );
});

test("explicit sign-out releases the shell, and a short clerk signed-out blip does not", () => {
  assert.equal(
    shouldHoldSignedInShell({
      established: true,
      explicitSignOut: true,
      isLoaded: false,
      isSignedIn: false,
      tokenReconnecting: true,
      signedOutForMs: 0,
    }),
    false,
  );
  assert.equal(
    shouldHoldSignedInShell({
      established: true,
      explicitSignOut: false,
      isLoaded: true,
      isSignedIn: false,
      tokenReconnecting: false,
      signedOutForMs: 1_000,
    }),
    true,
  );
  assert.equal(
    shouldHoldSignedInShell({
      established: true,
      explicitSignOut: false,
      isLoaded: true,
      isSignedIn: false,
      tokenReconnecting: false,
      signedOutForMs: CLERK_SIGNOUT_GRACE_MS,
    }),
    false,
  );
});

test("an established session survives a bridge remount until sign-out", () => {
  resetClerkSessionGateForTests();
  assert.equal(hasEstablishedClerkSession(), false);
  markClerkSessionEstablished();
  assert.equal(hasEstablishedClerkSession(), true);
  markClerkExplicitSignOut();
  assert.equal(hasEstablishedClerkSession(), false);
  resetClerkSessionGateForTests();
});
