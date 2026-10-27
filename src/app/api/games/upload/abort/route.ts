import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import {
  abortRomMultipartUpload,
  deleteStoredFile,
  isOwnedCoverStorageKey,
  isOwnedRomStorageKey,
} from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const values = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const key = typeof values.key === "string" ? values.key : "";
  const uploadId = typeof values.uploadId === "string" ? values.uploadId : "";
  const coverStoragePath = typeof values.coverStoragePath === "string" ? values.coverStoragePath : null;

  if (!isOwnedRomStorageKey(key, user.id) || !uploadId || uploadId.length > 256) {
    return NextResponse.json({ error: "Некорректная загрузка" }, { status: 400 });
  }

  let safeToDelete = true;
  try {
    await abortRomMultipartUpload(key, uploadId);
  } catch (error) {
    // If completion committed before the client lost its response, keep the game's R2 object.
    const db = await getDb();
    const rows = await db
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.ownerId, user.id), eq(games.romStoragePath, key)))
      .limit(1);
    safeToDelete = rows.length === 0;
    console.warn("Unable to abort multipart upload", error);
  }

  if (safeToDelete) {
    await deleteStoredFile(key);
    if (coverStoragePath && isOwnedCoverStorageKey(coverStoragePath, user.id)) {
      await deleteStoredFile(coverStoragePath);
    }
  }

  return NextResponse.json({ ok: true });
}
