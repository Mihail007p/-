import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  createCoverBlobPath,
  createRomBlobPath,
  isOwnedCoverStoragePath,
  isOwnedRomStoragePath,
} from "@/lib/storage";
import {
  getSystem,
  isExtensionAllowed,
  isValidCoverFilename,
  isValidRomFilename,
  MAX_COVER_SIZE_BYTES,
  MAX_ROM_SIZE_BYTES,
} from "@/lib/systems";

export const runtime = "nodejs";

const ROM_CONTENT_TYPES = ["application/octet-stream"];
const COVER_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос загрузки" }, { status: 400 });
  }

  const uploadBody = body as HandleUploadBody;
  if (uploadBody.type !== "blob.generate-client-token") {
    return NextResponse.json({ error: "Неизвестный запрос загрузки" }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  try {
    const result = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!user) throw new Error("Требуется вход");
        const payload = JSON.parse(clientPayload ?? "{}") as {
          gameId?: unknown;
          kind?: unknown;
          filename?: unknown;
          system?: unknown;
        };
        const { gameId, kind, filename, system: systemId } = payload;

        if (typeof gameId !== "string" || typeof kind !== "string" || typeof filename !== "string") {
          throw new Error("Некорректные данные файла");
        }

        if (kind === "rom") {
          const system = typeof systemId === "string" ? getSystem(systemId) : undefined;
          if (
            !system ||
            !isValidRomFilename(filename) ||
            !isExtensionAllowed(filename, system) ||
            pathname !== createRomBlobPath(user.id, gameId, filename) ||
            !isOwnedRomStoragePath(pathname, user.id, gameId)
          ) {
            throw new Error("Некорректный ROM-файл");
          }
          return {
            allowedContentTypes: ROM_CONTENT_TYPES,
            maximumSizeInBytes: MAX_ROM_SIZE_BYTES,
            addRandomSuffix: true,
          };
        }

        const coverExtension = filename.split(".").at(-1)?.toLowerCase() ?? "";
        if (
          kind === "cover" &&
          isValidCoverFilename(filename) &&
          ["png", "jpg", "jpeg", "webp", "gif"].includes(coverExtension) &&
          pathname === createCoverBlobPath(user.id, gameId, filename) &&
          isOwnedCoverStoragePath(pathname, user.id, gameId)
        ) {
          return {
            allowedContentTypes: COVER_CONTENT_TYPES,
            maximumSizeInBytes: MAX_COVER_SIZE_BYTES,
            addRandomSuffix: true,
          };
        }

        throw new Error("Некорректный тип файла");
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Unable to authorize Vercel Blob upload", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось разрешить загрузку" },
      { status: 400 },
    );
  }
}
