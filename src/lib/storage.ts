import { mkdir, writeFile, unlink } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Readable } from "stream";

const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const ROMS_DIR = path.join(STORAGE_ROOT, "roms");
export const COVERS_DIR = path.join(STORAGE_ROOT, "covers");

async function ensureDirs() {
  await mkdir(ROMS_DIR, { recursive: true });
  await mkdir(COVERS_DIR, { recursive: true });
}

export async function saveUploadedFile(
  file: File,
  dir: string,
): Promise<{ filename: string; absolutePath: string; size: number }> {
  await ensureDirs();
  const ext = path.extname(file.name) || "";
  const filename = `${randomUUID()}${ext.toLowerCase()}`;
  const absolutePath = path.join(dir, filename);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(absolutePath, buffer);
  return { filename, absolutePath, size: buffer.length };
}

export async function deleteStoredFile(absolutePath: string | null | undefined) {
  if (!absolutePath) return;
  try {
    if (existsSync(absolutePath)) {
      await unlink(absolutePath);
    }
  } catch {
    // ignore cleanup errors
  }
}

export async function getFileSize(absolutePath: string): Promise<number> {
  const stats = await stat(absolutePath);
  return stats.size;
}

export function readFileAsWebStream(absolutePath: string): ReadableStream {
  const nodeStream = createReadStream(absolutePath);
  return Readable.toWeb(nodeStream) as ReadableStream;
}
