import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import {
  getStorageBucket,
  isOwnedCoverStorageKey,
  isOwnedRomStorageKey,
  ROM_PART_SIZE_BYTES,
} from "@/lib/storage";
import {
  getSystem,
  isExtensionAllowed,
  isValidRomFilename,
  MAX_COVER_SIZE_BYTES,
  MAX_GAME_TITLE_LENGTH,
  MAX_ROM_SIZE_BYTES,
} from "@/lib/systems";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const {
    gameId,
    key,
    uploadId,
    parts,
    title,
    system: systemId,
    romFilename,
    romSizeBytes,
    coverStoragePath,
    coverFilename,
  } = body as {
    gameId?: unknown;
    key?: unknown;
    uploadId?: unknown;
    parts?: unknown;
    title?: unknown;
    system?: unknown;
    romFilename?: unknown;
    romSizeBytes?: unknown;
    coverStoragePath?: unknown;
    coverFilename?: unknown;
  };

  if (
    typeof gameId !== "string" ||
    typeof key !== "string" ||
    typeof uploadId !== "string" ||
    typeof title !== "string" ||
    typeof systemId !== "string" ||
    typeof romFilename !== "string" ||
    typeof romSizeBytes !== "number" ||
    !Array.isArray(parts)
  ) {
    return NextResponse.json({ error: "Не хватает данных для завершения загрузки" }, { status: 400 });
  }

  const system = getSystem(systemId);
  const expectedParts = Math.ceil(romSizeBytes / ROM_PART_SIZE_BYTES);
  if (
    !system ||
    !title.trim() ||
    title.length > MAX_GAME_TITLE_LENGTH ||
    !isValidRomFilename(romFilename) ||
    !isExtensionAllowed(romFilename, system)
  ) {
    return NextResponse.json({ error: "Некорректные данные игры" }, { status: 400 });
  }
  if (!Number.isSafeInteger(romSizeBytes) || romSizeBytes <= 0 || romSizeBytes > MAX_ROM_SIZE_BYTES) {
    return NextResponse.json({ error: "Некорректный размер ROM" }, { status: 400 });
  }
  if (!isOwnedRomStorageKey(key, user.id) || key.split("/")[2] !== gameId || uploadId.length > 256) {
    return NextResponse.json({ error: "Загрузка не найдена" }, { status: 400 });
  }
  if (parts.length !== expectedParts) {
    return NextResponse.json({ error: "Загружены не все части файла" }, { status: 400 });
  }

  const completedParts: R2UploadedPart[] = [];
  for (const part of parts) {
    if (
      !part ||
      typeof part !== "object" ||
      !Number.isInteger(part.partNumber) ||
      part.partNumber < 1 ||
      part.partNumber > expectedParts ||
      typeof part.etag !== "string" ||
      part.etag.length < 1 ||
      part.etag.length > 256
    ) {
      return NextResponse.json({ error: "Некорректные данные части файла" }, { status: 400 });
    }
    completedParts.push({ partNumber: part.partNumber, etag: part.etag });
  }
  completedParts.sort((a, b) => a.partNumber - b.partNumber);
  if (completedParts.some((part, index) => part.partNumber !== index + 1)) {
    return NextResponse.json({ error: "Некорректный порядок частей файла" }, { status: 400 });
  }

  const safeCoverPath = typeof coverStoragePath === "string" ? coverStoragePath : null;
  const safeCoverFilename = typeof coverFilename === "string" ? coverFilename : null;
  if ((safeCoverPath === null) !== (safeCoverFilename === null)) {
    return NextResponse.json({ error: "Некорректная обложка" }, { status: 400 });
  }
  if (safeCoverPath && !isOwnedCoverStorageKey(safeCoverPath, user.id)) {
    return NextResponse.json({ error: "Некорректная обложка" }, { status: 400 });
  }

  const db = await getDb();
  const existingRows = await db
    .select()
    .from(games)
    .where(and(eq(games.ownerId, user.id), eq(games.id, gameId)))
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    if (existing.romStoragePath === key) return NextResponse.json({ game: existing });
    return NextResponse.json({ error: "Игра с таким идентификатором уже существует" }, { status: 409 });
  }

  const bucket = await getStorageBucket();
  try {
    let romObject: R2Object | null = null;
    try {
      romObject = await bucket.resumeMultipartUpload(key, uploadId).complete(completedParts);
    } catch (error) {
      // If a previous completion succeeded but its response was lost, reuse the completed object.
      const completedObject = await bucket.head(key).catch(() => null);
      if (
        !completedObject ||
        completedObject.size !== romSizeBytes ||
        completedObject.customMetadata?.ownerId !== user.id ||
        completedObject.customMetadata?.gameId !== gameId
      ) {
        throw error;
      }
      romObject = completedObject;
    }

    if (!romObject || romObject.size !== romSizeBytes || romObject.customMetadata?.ownerId !== user.id || romObject.customMetadata?.gameId !== gameId) {
      await bucket.delete(key);
      if (safeCoverPath) await bucket.delete(safeCoverPath);
      return NextResponse.json({ error: "Загруженный файл не прошёл проверку" }, { status: 400 });
    }

    if (safeCoverPath) {
      const cover = await bucket.head(safeCoverPath);
      if (!cover || cover.size > MAX_COVER_SIZE_BYTES) {
        await bucket.delete(key);
        if (cover) await bucket.delete(safeCoverPath);
        return NextResponse.json({ error: "Обложка не прошла проверку" }, { status: 400 });
      }
    }

    const [created] = await db
      .insert(games)
      .values({
        id: gameId,
        ownerId: user.id,
        title: title.trim(),
        system: system.id,
        romFilename,
        romStoragePath: key,
        romSizeBytes,
        coverStoragePath: safeCoverPath,
        coverFilename: safeCoverFilename,
      })
      .returning();

    return NextResponse.json({ game: created }, { status: 201 });
  } catch (error) {
    // A second completion request may race with the first, or its response may have been lost.
    try {
      const committedRows = await db
        .select()
        .from(games)
        .where(and(eq(games.ownerId, user.id), eq(games.id, gameId)))
        .limit(1);
      const committed = committedRows[0];
      if (committed?.romStoragePath === key) return NextResponse.json({ game: committed });
      if (committed) {
        await bucket.delete(key).catch(() => undefined);
        if (safeCoverPath) await bucket.delete(safeCoverPath).catch(() => undefined);
        return NextResponse.json({ error: "Игра с таким идентификатором уже существует" }, { status: 409 });
      }
    } catch (lookupError) {
      // Preserve the objects if D1 cannot confirm whether the game row committed.
      console.error("Unable to verify ROM upload completion", lookupError);
      return NextResponse.json({ error: "Не удалось проверить сохранение игры" }, { status: 500 });
    }

    await bucket.resumeMultipartUpload(key, uploadId).abort().catch(() => undefined);
    await bucket.delete(key).catch(() => undefined);
    if (safeCoverPath) await bucket.delete(safeCoverPath).catch(() => undefined);
    console.error("Unable to complete ROM upload", error);
    return NextResponse.json({ error: "Не удалось сохранить игру" }, { status: 500 });
  }
}
