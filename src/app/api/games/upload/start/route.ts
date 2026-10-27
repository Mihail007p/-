import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getSystem,
  isExtensionAllowed,
  isValidCoverFilename,
  isValidRomFilename,
  MAX_COVER_SIZE_BYTES,
  MAX_GAME_TITLE_LENGTH,
  MAX_ROM_SIZE_BYTES,
} from "@/lib/systems";
import { createCoverBlobPath, createRomBlobPath } from "@/lib/storage";

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
  const title = typeof values.title === "string" ? values.title.trim() : "";
  const systemId = typeof values.system === "string" ? values.system : "";
  const romFilename = typeof values.romFilename === "string" ? values.romFilename : "";
  const romSizeBytes = typeof values.romSizeBytes === "number" ? values.romSizeBytes : NaN;
  const coverFilename = typeof values.coverFilename === "string" ? values.coverFilename : null;
  const coverSizeBytes = typeof values.coverSizeBytes === "number" ? values.coverSizeBytes : null;
  const system = getSystem(systemId);

  if (!title) return NextResponse.json({ error: "Введите название игры" }, { status: 400 });
  if (title.length > MAX_GAME_TITLE_LENGTH) {
    return NextResponse.json({ error: `Название должно быть не длиннее ${MAX_GAME_TITLE_LENGTH} символов` }, { status: 400 });
  }
  if (!system) return NextResponse.json({ error: "Выберите систему" }, { status: 400 });
  if (!isValidRomFilename(romFilename) || !isExtensionAllowed(romFilename, system)) {
    return NextResponse.json({ error: "Неподходящее имя или расширение ROM-файла" }, { status: 400 });
  }
  if (!Number.isSafeInteger(romSizeBytes) || romSizeBytes <= 0 || romSizeBytes > MAX_ROM_SIZE_BYTES) {
    return NextResponse.json({ error: "Файл ROM слишком большой (максимум 500 МБ)" }, { status: 400 });
  }

  if ((coverFilename === null) !== (coverSizeBytes === null)) {
    return NextResponse.json({ error: "Некорректные данные обложки" }, { status: 400 });
  }
  if (coverFilename && coverSizeBytes !== null) {
    const extension = coverFilename.split(".").at(-1)?.toLowerCase() ?? "";
    if (!isValidCoverFilename(coverFilename) || !COVER_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "Поддерживаются обложки PNG, JPG, WEBP или GIF" }, { status: 400 });
    }
    if (!Number.isSafeInteger(coverSizeBytes) || coverSizeBytes <= 0 || coverSizeBytes > MAX_COVER_SIZE_BYTES) {
      return NextResponse.json({ error: "Обложка слишком большая (максимум 8 МБ)" }, { status: 400 });
    }
  }

  const gameId = crypto.randomUUID();
  return NextResponse.json(
    {
      gameId,
      romStoragePath: createRomBlobPath(user.id, gameId, romFilename),
      coverStoragePath: coverFilename ? createCoverBlobPath(user.id, gameId, coverFilename) : null,
      romFilename,
      romSizeBytes,
      coverFilename,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
