export function gidToLegacyId(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const parts = gid.split("/");
  return parts[parts.length - 1] ?? gid;
}

export function legacyIdToGid(
  resource: string,
  id: string | number | null | undefined,
): string | null {
  if (id === null || id === undefined) return null;
  return `gid://shopify/${resource}/${id}`;
}
