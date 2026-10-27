import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSystem, isExtensionAllowed, MAX_ROM_SIZE_BYTES, MAX_COVER_SIZE_BYTES } from "@/lib/systems";
import { saveUploadedFile, deleteStoredFile, ROMS_DIR, COVERS_DIR } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(games)
    .where(eq(games.ownerId, user.id))
    .orderBy(desc(games.lastPlayedAt), desc(games.createdAt));

  return NextResponse.json({ games: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const formData = await request.formData();
  const title = (formData.get("title") as string | null)?.trim();
  const systemId = formData.get("system") as string | null;
  const romFile = formData.get("rom") as File | null;
  const coverFile = formData.get("cover") as File | null;

  if (!title) {
    return NextResponse.json({ error: "Введите название игры" }, { status: 400 });
  }
  const system = systemId ? getSystem(systemId) : undefined;
  if (!system) {
    return NextResponse.json({ error: "Выберите систему" }, { status: 400 });
  }
  if (!romFile || typeof romFile === "string" || romFile.size === 0) {
    return NextResponse.json({ error: "Прикрепите файл ROM" }, { status: 400 });
  }
  if (romFile.size > MAX_ROM_SIZE_BYTES) {
    return NextResponse.json({ error: "Файл ROM слишком большой (максимум 500 МБ)" }, { status: 400 });
  }
  if (!isExtensionAllowed(romFile.name, system)) {
    return NextResponse.json(
      { error: `Неподходящее расширение файла. Разрешены: ${system.extensions.join(", ")}` },
      { status: 400 },
    );
  }
  if (coverFile && typeof coverFile !== "string" && coverFile.size > MAX_COVER_SIZE_BYTES) {
    return NextResponse.json({ error: "Обложка слишком большая (максимум 8 МБ)" }, { status: 400 });
  }

  const savedRom = await saveUploadedFile(romFile, ROMS_DIR);

  let coverFilename: string | null = null;
  let coverPath: string | null = null;
  if (coverFile && typeof coverFile !== "string" && coverFile.size > 0) {
    const savedCover = await saveUploadedFile(coverFile, COVERS_DIR);
    coverFilename = savedCover.filename;
    coverPath = savedCover.absolutePath;
  }

  try {
    const [created] = await db
      .insert(games)
      .values({
        ownerId: user.id,
        title,
        system: system.id,
        romFilename: romFile.name,
        romStoragePath: savedRom.absolutePath,
        romSizeBytes: savedRom.size,
        coverFilename,
        coverStoragePath: coverPath,
      })
      .returning();

    return NextResponse.json({ game: created }, { status: 201 });
  } catch (error) {
    await deleteStoredFile(savedRom.absolutePath);
    await deleteStoredFile(coverPath);
    console.error(error);
    return NextResponse.json({ error: "Не удалось сохранить игру" }, { status: 500 });
  }
}
