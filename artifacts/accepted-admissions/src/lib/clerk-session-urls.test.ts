import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClerkRouterNavigation,
  clerkRouterDestination,
  clerkSignInUrl,
  isClerkAccountHost,
  stripAppBasePath,
} from "./clerk-session-urls.ts";

test("Clerk account hosts include the hosted Account Portal, not the app host", () => {
  assert.equal(isClerkAccountHost("accounts.acceptedadmissions.org"), true);
  assert.equal(isClerkAccountHost("accounts.app.acceptedadmissions.org"), true);
  assert.equal(isClerkAccountHost("accepted-xxx.clerk.accounts.dev"), true);
  assert.equal(isClerkAccountHost("app.acceptedadmissions.org"), false);
  assert.equal(isClerkAccountHost("www.acceptedadmissions.org"), false);
});

test("sign-in URL is absolute on the app host so Account Portal returns keep cookies", () => {
  assert.equal(
    clerkSignInUrl("", {
      hostname: "app.acceptedadmissions.org",
      origin: "https://app.acceptedadmissions.org",
    }),
    "https://app.acceptedadmissions.org/login",
  );
  assert.equal(
    clerkSignInUrl("", {
      hostname: "www.acceptedadmissions.org",
      origin: "https://www.acceptedadmissions.org",
    }),
    "https://app.acceptedadmissions.org/login",
  );
  assert.equal(
    clerkSignInUrl("", {
      hostname: "accounts.acceptedadmissions.org",
      origin: "https://accounts.acceptedadmissions.org",
    }),
    "https://app.acceptedadmissions.org/login",
  );
  assert.equal(
    clerkSignInUrl("", {
      hostname: "localhost",
      origin: "http://localhost:5173",
    }),
    "http://localhost:5173/login",
  );
});

test("routerPush keeps same-origin paths in the SPA and sends foreign account hosts to /portal", () => {
  assert.deepEqual(
    clerkRouterDestination("/tutor", "", "https://app.acceptedadmissions.org"),
    { type: "in-app", path: "/tutor" },
  );
  assert.deepEqual(
    clerkRouterDestination(
      "https://app.acceptedadmissions.org/tutor",
      "",
      "https://app.acceptedadmissions.org",
    ),
    { type: "in-app", path: "/tutor" },
  );
  assert.deepEqual(
    clerkRouterDestination(
      "https://www.acceptedadmissions.org/tutor",
      "",
      "https://app.acceptedadmissions.org",
    ),
    { type: "hard", url: "https://app.acceptedadmissions.org/tutor" },
  );
  assert.deepEqual(
    clerkRouterDestination(
      "https://accounts.acceptedadmissions.org/user",
      "",
      "https://app.acceptedadmissions.org",
    ),
    { type: "hard", url: "https://app.acceptedadmissions.org/portal" },
  );
  assert.equal(stripAppBasePath("/accepted-admissions/tutor", "/accepted-admissions"), "/tutor");
});

test("applyClerkRouterNavigation hard-redirects Account Portal URLs instead of treating them as SPA paths", () => {
  const locations: string[] = [];
  const assigned: string[] = [];
  applyClerkRouterNavigation(
    "https://accounts.acceptedadmissions.org/user",
    "",
    (path) => {
      locations.push(path);
    },
    {
      currentOrigin: "https://app.acceptedadmissions.org",
      assign: (url) => {
        assigned.push(url);
      },
    },
  );
  assert.deepEqual(locations, []);
  assert.deepEqual(assigned, ["https://app.acceptedadmissions.org/portal"]);

  applyClerkRouterNavigation(
    "https://app.acceptedadmissions.org/tutor",
    "",
    (path) => {
      locations.push(path);
    },
    { currentOrigin: "https://app.acceptedadmissions.org" },
  );
  assert.deepEqual(locations, ["/tutor"]);
});
