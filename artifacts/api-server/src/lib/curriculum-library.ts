export const LIBRARY_ASSET_KINDS = [
  "practice_test",
  "mini_section",
  "resource",
] as const;

export type LibraryAssetKind = (typeof LIBRARY_ASSET_KINDS)[number];

export type LibraryAssetSource = {
  id: string;
  title: string;
  kind: string;
  description: string | null;
  resourceUrl: string | null;
  body: string | null;
};

export function isLibraryAssetKind(value: string): value is LibraryAssetKind {
  return (LIBRARY_ASSET_KINDS as readonly string[]).includes(value);
}

export function libraryAssetToBlockConfig(asset: LibraryAssetSource) {
  const description = asset.description?.trim() || "";
  const body = asset.body?.trim() || "";
  const resourceUrl = asset.resourceUrl?.trim() || "";
  return {
    title: asset.title,
    label: asset.title,
    text: description || asset.title,
    html: body,
    url: resourceUrl,
    libraryAssetId: asset.id,
    libraryKind: asset.kind,
  };
}

export function libraryAssetBlockKind(
  asset: Pick<LibraryAssetSource, "resourceUrl">,
): "external_link" | "callout" {
  return asset.resourceUrl?.trim() ? "external_link" : "callout";
}
