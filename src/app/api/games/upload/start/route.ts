import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getSystem,
  isExtensionAllowed,
  isValidRomFilename,
  MAX_COVER_SIZE_BYTES,
  MAX_GAME_TITLE_LENGTH,
  MAX_ROM_SIZE_BYTES,
} from "@/lib/systems";
import {
  deleteStoredFile,
  ROM_PART_SIZE_BYTES,
  saveUploadedFile,
  startRomMultipartUpload,
} from "@/lib/storage";

export const runtime = "nodejs";

const COVER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const titleValue = formData.get("title");
  const systemValue = formData.get("system");
  const filenameValue = formData.get("romFilename");
  const sizeValue = formData.get("romSizeBytes");
  const title = typeof titleValue === "string" ? titleValue.trim() : "";
  const systemId = typeof systemValue === "string" ? systemValue : "";
  const romFilename = typeof filenameValue === "string" ? filenameValue : "";
  const romSizeBytes = typeof sizeValue === "string" ? Number(sizeValue) : NaN;
  const system = getSystem(systemId);

  if (!title) return NextResponse.json({ error: "Введите название игры" }, { status: 400 });
  if (title.length > MAX_GAME_TITLE_LENGTH) {
    return NextResponse.json({ error: `Название должно быть не длиннее ${MAX_GAME_TITLE_LENGTH} символов` }, { status: 400 });
  }
  if (!system) return NextResponse.json({ error: "Выберите систему" }, { status: 400 });
  if (!isValidRomFilename(romFilename)) {
    return NextResponse.json({ error: "Некорректное имя файла ROM" }, { status: 400 });
  }
  if (!Number.isSafeInteger(romSizeBytes) || romSizeBytes <= 0) {
    return NextResponse.json({ error: "Выберите корректный файл ROM" }, { status: 400 });
  }
  if (romSizeBytes > MAX_ROM_SIZE_BYTES) {
    return NextResponse.json({ error: "Файл ROM слишком большой (максимум 500 МБ)" }, { status: 400 });
  }
  if (!isExtensionAllowed(romFilename, system)) {
    return NextResponse.json(
      { error: `Неподходящее расширение файла. Разрешены: ${system.extensions.join(", ")}` },
      { status: 400 },
    );
  }

  const coverValue = formData.get("cover");
  const coverFile = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
  if (coverValue && typeof coverValue !== "string" && coverValue.size > MAX_COVER_SIZE_BYTES) {
    return NextResponse.json({ error: "Обложка слишком большая (максимум 8 МБ)" }, { status: 400 });
  }
  if (coverFile) {
    const extension = coverFile.name.split(".").at(-1)?.toLowerCase() ?? "";
    if (!COVER_EXTENSIONS.has(extension) || (coverFile.type && !coverFile.type.startsWith("image/"))) {
      return NextResponse.json({ error: "Поддерживаются обложки PNG, JPG, WEBP или GIF" }, { status: 400 });
    }
  }

  const gameId = crypto.randomUUID();
  let coverStoragePath: string | null = null;
  let coverFilename: string | null = null;

  try {
    if (coverFile) {
      const cover = await saveUploadedFile(coverFile, "covers", user.id);
      coverStoragePath = cover.storagePath;
      coverFilename = cover.filename;
    }

    const upload = await startRomMultipartUpload({
      ownerId: user.id,
      gameId,
      system: system.id,
      filename: romFilename,
    });

    return NextResponse.json(
      {
        gameId,
        key: upload.key,
        uploadId: upload.uploadId,
        partSize: ROM_PART_SIZE_BYTES,
        coverStoragePath,
        coverFilename,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await deleteStoredFile(coverStoragePath);
    console.error("Unable to start ROM upload", error);
    return NextResponse.json({ error: "Не удалось начать загрузку игры" }, { status: 500 });
  }
}
