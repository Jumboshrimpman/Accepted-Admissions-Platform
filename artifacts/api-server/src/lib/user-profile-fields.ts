// @ts-expect-error Node's strip-types test runner resolves the source extension directly.
import { safePhotoSource } from "./tutor-profile-fields.ts";

export const PLACEHOLDER_DISPLAY_NAME = /^accepted admissions user$/i;

export type UserProfileEditable = {
  displayName?: string;
  title?: string | null;
  avatarUrl?: string | null;
};

export function isPlaceholderDisplayName(name?: string | null): boolean {
  return !name?.trim() || PLACEHOLDER_DISPLAY_NAME.test(name.trim());
}

export function provisionedDisplayName(
  identityName?: string | null,
  email?: string | null,
): string {
  if (identityName && !isPlaceholderDisplayName(identityName)) {
    return identityName.trim();
  }
  const local = email?.split("@")[0]?.trim() ?? "";
  if (
    local &&
    !local.toLowerCase().includes("users.accepted") &&
    local.length > 1
  ) {
    return local.replace(/[._-]+/g, " ").trim();
  }
  return "Account";
}

export function resolveDisplayName(
  storedName?: string | null,
  identityName?: string | null,
  email?: string | null,
): string {
  if (storedName && !isPlaceholderDisplayName(storedName)) {
    return storedName.trim();
  }
  return provisionedDisplayName(identityName, email);
}

export function parseUserProfileEditableFields(
  body: Record<string, unknown>,
): { updates: UserProfileEditable; error?: string } {
  const updates: UserProfileEditable = {};
  if ("displayName" in body) {
    if (typeof body.displayName !== "string" || !body.displayName.trim()) {
      return { updates, error: "A display name is required when provided." };
    }
    if (body.displayName.trim().length > 200) {
      return { updates, error: "A display name must be 200 characters or fewer." };
    }
    updates.displayName = body.displayName.trim();
  }
  if ("title" in body) {
    if (body.title === null) {
      updates.title = null;
    } else if (typeof body.title !== "string") {
      return { updates, error: "A title must be a string or null." };
    } else if (!body.title.trim()) {
      updates.title = null;
    } else if (body.title.trim().length > 120) {
      return { updates, error: "A title must be 120 characters or fewer." };
    } else {
      updates.title = body.title.trim();
    }
  }
  if ("avatarUrl" in body) {
    if (body.avatarUrl === null) {
      updates.avatarUrl = null;
    } else if (typeof body.avatarUrl !== "string") {
      return { updates, error: "A photo must be a string or null." };
    } else if (!body.avatarUrl.trim()) {
      updates.avatarUrl = null;
    } else if (!safePhotoSource(body.avatarUrl.trim())) {
      return {
        updates,
        error:
          "A photo must be an http(s) image URL, a site-relative media path, or an uploaded jpeg/png/webp/gif under 2 MB.",
      };
    } else {
      updates.avatarUrl = body.avatarUrl.trim();
    }
  }
  if (Object.keys(updates).length === 0) {
    return { updates, error: "Provide a display name, title, or photo to update." };
  }
  return { updates };
}
