export const MAX_PHOTO_DATA_URL_LENGTH = 2_500_000;
const ALLOWED_DATA_IMAGE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;

export function safePublicUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function safePhotoSource(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("data:image/")) {
    if (value.length > MAX_PHOTO_DATA_URL_LENGTH) return false;
    return ALLOWED_DATA_IMAGE.test(value.replace(/\s+/g, ""));
  }
  // Same-origin relative media paths from local hosting (no protocol-relative or traversal).
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("..")
  ) {
    return true;
  }
  return safePublicUrl(value);
}

export type TutorProfileEditable = {
  name?: string;
  title?: string;
  photoUrl?: string | null;
  photoAltText?: string | null;
  biography?: string | null;
  subjects?: string[];
  linkedinUrl?: string | null;
};

export function parseTutorProfileEditableFields(
  body: Record<string, unknown>,
  options: { requireName?: boolean } = {},
): { updates: TutorProfileEditable; error?: string } {
  const updates: TutorProfileEditable = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { updates, error: "A profile name is required." };
    }
    if (body.name.trim().length > 200) {
      return { updates, error: "A profile name must be 200 characters or fewer." };
    }
    updates.name = body.name.trim();
  } else if (options.requireName) {
    return { updates, error: "A profile name is required." };
  }
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return { updates, error: "A title is required when provided." };
    }
    updates.title = body.title.trim();
  }
  for (const field of ["photoUrl", "photoAltText", "biography", "linkedinUrl"] as const) {
    if (!(field in body)) continue;
    if (body[field] === null) {
      updates[field] = null;
      continue;
    }
    if (typeof body[field] !== "string") {
      return { updates, error: `${field} must be a string or null.` };
    }
    const value = body[field].trim();
    updates[field] = value || null;
  }
  if ("subjects" in body) {
    if (!Array.isArray(body.subjects) || !body.subjects.every((item) => typeof item === "string")) {
      return { updates, error: "Subjects must be an array of strings." };
    }
    updates.subjects = body.subjects.map((item) => item.trim()).filter(Boolean);
  }
  if (
    updates.photoUrl !== undefined &&
    updates.photoUrl !== null &&
    !safePhotoSource(updates.photoUrl)
  ) {
    return {
      updates,
      error:
        "A photo must be an http(s) image URL, a site-relative media path, or an uploaded jpeg/png/webp/gif under 2 MB.",
    };
  }
  if (
    updates.linkedinUrl !== undefined &&
    updates.linkedinUrl !== null &&
    !safePublicUrl(updates.linkedinUrl)
  ) {
    return { updates, error: "A LinkedIn URL must use http or https." };
  }
  return { updates };
}

export function tutorProfileApprovalError(proposed: {
  name: unknown;
  title: unknown;
  biography: unknown;
  photoUrl: unknown;
  photoAltText: unknown;
  linkedinUrl: unknown;
  publicApproved: unknown;
}): string | null {
  if (proposed.publicApproved !== true) return null;
  if (
    typeof proposed.name !== "string" ||
    !proposed.name.trim() ||
    typeof proposed.title !== "string" ||
    !proposed.title.trim()
  ) {
    return "An approved tutor needs a name and title.";
  }
  if (typeof proposed.biography !== "string" || !proposed.biography.trim()) {
    return "An approved tutor needs a biography.";
  }
  if (
    proposed.photoUrl !== null &&
    proposed.photoUrl !== undefined &&
    !safePhotoSource(proposed.photoUrl)
  ) {
    return "A headshot must be an http(s) image URL, a site-relative media path, or an uploaded image under 2 MB.";
  }
  if (
    proposed.photoUrl &&
    (typeof proposed.photoAltText !== "string" || !proposed.photoAltText.trim())
  ) {
    return "A public headshot needs alt text.";
  }
  if (
    proposed.linkedinUrl !== null &&
    proposed.linkedinUrl !== undefined &&
    !safePublicUrl(proposed.linkedinUrl)
  ) {
    return "A LinkedIn URL must use http or https.";
  }
  return null;
}
