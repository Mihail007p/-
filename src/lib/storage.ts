import { getCloudflareContext } from "@opennextjs/cloudflare";

export const ROM_PART_SIZE_BYTES = 20 * 1024 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOwnedRomStorageKey(key: string, ownerId: string) {
  const segments = key.split("/");
  return (
    segments.length === 4 &&
    segments[0] === "roms" &&
    segments[1] === ownerId &&
    UUID_PATTERN.test(segments[2]) &&
    /^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i.test(segments[3])
  );
}

export function isOwnedCoverStorageKey(key: string, ownerId: string) {
  const segments = key.split("/");
  return (
    segments.length === 3 &&
    segments[0] === "covers" &&
    segments[1] === ownerId &&
    /^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i.test(segments[2])
  );
}

export async function getStorageBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.ROM_FILES;
}

function extensionOf(filename: string) {
  const match = filename.match(/\.[a-zA-Z0-9]{1,10}$/);
  return match?.[0].toLowerCase() ?? "";
}

export async function saveUploadedFile(
  file: File,
  kind: "covers",
  ownerId: string,
): Promise<{ filename: string; storagePath: string; size: number }> {
  const key = `${kind}/${ownerId}/${crypto.randomUUID()}${extensionOf(file.name)}`;
  const bucket = await getStorageBucket();
  const object = await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  return {
    filename: key.split("/").at(-1) ?? key,
    storagePath: key,
    size: object.size,
  };
}

export async function deleteStoredFile(key: string | null | undefined) {
  if (!key) return;
  try {
    const bucket = await getStorageBucket();
    await bucket.delete(key);
  } catch (error) {
    console.error("Failed to delete R2 object", error);
  }
}

export async function startRomMultipartUpload({
  ownerId,
  gameId,
  system,
  filename,
}: {
  ownerId: string;
  gameId: string;
  system: string;
  filename: string;
}) {
  const key = `roms/${ownerId}/${gameId}/${crypto.randomUUID()}${extensionOf(filename)}`;
  const bucket = await getStorageBucket();
  const upload = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { ownerId, gameId, system },
  });
  return { key, uploadId: upload.uploadId };
}

export async function uploadRomPart(key: string, uploadId: string, partNumber: number, body: ReadableStream) {
  const bucket = await getStorageBucket();
  return bucket.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, body);
}

export async function abortRomMultipartUpload(key: string, uploadId: string) {
  const bucket = await getStorageBucket();
  await bucket.resumeMultipartUpload(key, uploadId).abort();
}

export async function getStoredFile(key: string) {
  const bucket = await getStorageBucket();
  return bucket.get(key);
}
