import {
  isDeferredUnfinishedPrepBlock,
  studentFacingCopy,
} from "./assignment-visibility.ts";

export type DashboardMaterialKind = "external_link" | "file_link";

export type DashboardMaterial = {
  id: string;
  sessionId: string;
  title: string;
  description: string | null;
  url: string;
  kind: DashboardMaterialKind;
};

export type DashboardMaterialBlock = {
  id: string;
  sessionId: string;
  kind: string;
  visibility: string;
  status: string;
  position: number;
  config: unknown;
};

const RESOURCE_KINDS = new Set<DashboardMaterialKind>([
  "external_link",
  "file_link",
]);

function configRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function configString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Student downloads are site paths or http(s) links. Other schemes stay off the dashboard. */
export function dashboardMaterialUrl(value: string): string | null {
  const url = value.trim();
  if (!url || url.startsWith("//")) return null;
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
  } catch {
    return null;
  }
  return null;
}

function displayText(value: string, studentFacing: boolean): string {
  const text = studentFacing ? studentFacingCopy(value).trim() : value.trim();
  return text;
}

/**
 * Published student-visible file blocks from sessions already on the dashboard.
 * Tutor-only, draft, and in-session unfinished-prep notes stay off this list.
 * `sessionOrder` is oldest-first; newer sessions are listed first.
 */
export function dashboardMaterialsFromBlocks(
  blocks: readonly DashboardMaterialBlock[],
  options?: { studentFacing?: boolean; sessionOrder?: readonly string[] },
): DashboardMaterial[] {
  const studentFacing = options?.studentFacing ?? false;
  const rank = new Map(
    (options?.sessionOrder ?? []).map((id, index) => [id, index]),
  );
  const materials: Array<DashboardMaterial & { position: number }> = [];
  for (const block of blocks) {
    if (block.status !== "published") continue;
    if (block.visibility !== "student" && block.visibility !== "both") continue;
    if (!RESOURCE_KINDS.has(block.kind as DashboardMaterialKind)) continue;
    if (isDeferredUnfinishedPrepBlock(block)) continue;
    const config = configRecord(block.config);
    if (!config) continue;
    const url = dashboardMaterialUrl(configString(config, "url"));
    if (!url) continue;
    const rawTitle =
      configString(config, "title") || configString(config, "label");
    const title = displayText(rawTitle, studentFacing) || "Session material";
    const descriptionText = displayText(
      configString(config, "text"),
      studentFacing,
    );
    const description =
      descriptionText && descriptionText !== title ? descriptionText : null;
    materials.push({
      id: block.id,
      sessionId: block.sessionId,
      title,
      description,
      url,
      kind: block.kind as DashboardMaterialKind,
      position: block.position,
    });
  }
  materials.sort((left, right) => {
    const sessionDelta =
      (rank.get(right.sessionId) ?? -1) - (rank.get(left.sessionId) ?? -1);
    if (sessionDelta !== 0) return sessionDelta;
    if (left.position !== right.position) return left.position - right.position;
    return left.title.localeCompare(right.title);
  });
  return materials.map(({ position: _position, ...material }) => material);
}
