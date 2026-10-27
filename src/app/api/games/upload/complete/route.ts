import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import {
  deleteStoredFile,
  headStoredFile,
  isOwnedCoverStoragePath,
  isOwnedRomStoragePath,
} from "@/lib/storage";
import {
  getSystem,
  isExtensionAllowed,
  isValidCoverFilename,
  isValidRomFilename,
  MAX_COVER_SIZE_BYTES,
  MAX_GAME_TITLE_LENGTH,
  MAX_ROM_SIZE_BYTES,
} from "@/lib/systems";

export const runtime = "nodejs";

const COVER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const values = body as Record<string, unknown>;
  const gameId = typeof values.gameId === "string" ? values.gameId : "";
  const title = typeof values.title === "string" ? values.title.trim() : "";
  const systemId = typeof values.system === "string" ? values.system : "";
  const romFilename = typeof values.romFilename === "string" ? values.romFilename : "";
  const romSizeBytes = typeof values.romSizeBytes === "number" ? values.romSizeBytes : NaN;
  const romStoragePath = typeof values.romStoragePath === "string" ? values.romStoragePath : "";
  const coverStoragePath = typeof values.coverStoragePath === "string" ? values.coverStoragePath : null;
  const coverFilename = typeof values.coverFilename === "string" ? values.coverFilename : null;
  const system = getSystem(systemId);

  if (
    !gameId ||
    !title ||
    title.length > MAX_GAME_TITLE_LENGTH ||
    !system ||
    !isValidRomFilename(romFilename) ||
    !isExtensionAllowed(romFilename, system)
  ) {
    return NextResponse.json({ error: "Некорректные данные игры" }, { status: 400 });
  }
  if (!Number.isSafeInteger(romSizeBytes) || romSizeBytes <= 0 || romSizeBytes > MAX_ROM_SIZE_BYTES) {
    return NextResponse.json({ error: "Некорректный размер ROM" }, { status: 400 });
  }
  if (!isOwnedRomStoragePath(romStoragePath, user.id, gameId)) {
    return NextResponse.json({ error: "Загрузка ROM не найдена" }, { status: 400 });
  }
  if ((coverStoragePath === null) !== (coverFilename === null)) {
    return NextResponse.json({ error: "Некорректные данные обложки" }, { status: 400 });
  }
  const coverExtension = coverFilename?.split(".").at(-1)?.toLowerCase() ?? "";
  if (coverFilename && (!isValidCoverFilename(coverFilename) || !COVER_EXTENSIONS.has(coverExtension))) {
    return NextResponse.json({ error: "Некорректный файл обложки" }, { status: 400 });
  }
  if (coverStoragePath && (!isOwnedCoverStoragePath(coverStoragePath, user.id, gameId) || !coverFilename)) {
    return NextResponse.json({ error: "Загрузка обложки не найдена" }, { status: 400 });
  }

  const db = await getDb();
  const existingRows = await db
    .select()
    .from(games)
    .where(and(eq(games.ownerId, user.id), eq(games.id, gameId)))
    .limit(1);
  const existing = existingRows[0];
  if (existing) {
    if (existing.romStoragePath === romStoragePath) return NextResponse.json({ game: existing });
    return NextResponse.json({ error: "Игра с таким идентификатором уже существует" }, { status: 409 });
  }

  try {
    const romObject = await headStoredFile(romStoragePath);
    if (romObject.size !== romSizeBytes) {
      await deleteStoredFile(romStoragePath);
      if (coverStoragePath) await deleteStoredFile(coverStoragePath);
      return NextResponse.json({ error: "Размер ROM не совпадает с загруженным файлом" }, { status: 400 });
    }

    if (coverStoragePath) {
      const coverObject = await headStoredFile(coverStoragePath);
      if (coverObject.size <= 0 || coverObject.size > MAX_COVER_SIZE_BYTES) {
        await deleteStoredFile(romStoragePath);
        await deleteStoredFile(coverStoragePath);
        return NextResponse.json({ error: "Обложка не прошла проверку" }, { status: 400 });
      }
    }

    const [created] = await db
      .insert(games)
      .values({
        id: gameId,
        ownerId: user.id,
        title,
        system: system.id,
        romFilename,
        romStoragePath,
        romSizeBytes,
        coverStoragePath,
        coverFilename,
      })
      .returning();

    return NextResponse.json({ game: created }, { status: 201 });
  } catch (error) {
    try {
      const committedRows = await db
        .select()
        .from(games)
        .where(and(eq(games.ownerId, user.id), eq(games.id, gameId)))
        .limit(1);
      const committed = committedRows[0];
      if (committed?.romStoragePath === romStoragePath) return NextResponse.json({ game: committed });
      if (committed) {
        await deleteStoredFile(romStoragePath);
        if (coverStoragePath) await deleteStoredFile(coverStoragePath);
        return NextResponse.json({ error: "Игра с таким идентификатором уже существует" }, { status: 409 });
      }
    } catch (lookupError) {
      console.error("Unable to verify Vercel Blob upload completion", lookupError);
      return NextResponse.json({ error: "Не удалось проверить сохранение игры" }, { status: 500 });
    }

    await deleteStoredFile(romStoragePath);
    if (coverStoragePath) await deleteStoredFile(coverStoragePath);
    console.error("Unable to complete Vercel Blob upload", error);
    return NextResponse.json({ error: "Не удалось сохранить игру" }, { status: 500 });
  }
}
