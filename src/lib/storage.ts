import { del, get, head } from "@vercel/blob";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSafePathSegment(segment: string) {
  return segment.length > 0 && segment.length <= 300 && segment !== "." && segment !== ".." && !/[\\/\u0000-\u001f\u007f]/.test(segment);
}

export function sanitizeBlobFilename(filename: string) {
  return filename
    .normalize("NFKC")
    .replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 255) || "upload";
}

export function createRomBlobPath(ownerId: string, gameId: string, filename: string) {
  return `roms/${ownerId}/${gameId}/${sanitizeBlobFilename(filename)}`;
}

export function createCoverBlobPath(ownerId: string, gameId: string, filename: string) {
  return `covers/${ownerId}/${gameId}/${sanitizeBlobFilename(filename)}`;
}

function isOwnedBlobPath(pathname: string, kind: "roms" | "covers", ownerId: string, gameId?: string) {
  const segments = pathname.split("/");
  return (
    segments.length === 4 &&
    segments[0] === kind &&
    segments[1] === ownerId &&
    UUID_PATTERN.test(segments[2]) &&
    (!gameId || segments[2] === gameId) &&
    isSafePathSegment(segments[3])
  );
}

export function isOwnedRomStoragePath(pathname: string, ownerId: string, gameId?: string) {
  return isOwnedBlobPath(pathname, "roms", ownerId, gameId);
}

export function isOwnedCoverStoragePath(pathname: string, ownerId: string, gameId?: string) {
  return isOwnedBlobPath(pathname, "covers", ownerId, gameId);
}

export async function getStoredFile(pathname: string) {
  return get(pathname, { access: "private" });
}

export async function headStoredFile(pathname: string) {
  return head(pathname);
}

export async function deleteStoredFile(pathname: string | null | undefined) {
  if (!pathname) return;
  try {
    await del(pathname);
  } catch (error) {
    console.error("Failed to delete Vercel Blob object", error);
  }
}
