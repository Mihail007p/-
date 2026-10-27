import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isOwnedRomStorageKey, ROM_PART_SIZE_BYTES, uploadRomPart } from "@/lib/storage";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const uploadId = url.searchParams.get("uploadId") ?? "";
  const partNumber = Number(url.searchParams.get("partNumber"));
  const contentLength = Number(request.headers.get("x-chunk-length") ?? request.headers.get("content-length") ?? "0");

  if (!isOwnedRomStorageKey(key, user.id) || !uploadId || uploadId.length > 256) {
    return NextResponse.json({ error: "Некорректная загрузка" }, { status: 400 });
  }
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000) {
    return NextResponse.json({ error: "Некорректный номер части" }, { status: 400 });
  }
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return NextResponse.json({ error: "Не удалось определить размер части файла" }, { status: 411 });
  }
  if (contentLength > ROM_PART_SIZE_BYTES) {
    return NextResponse.json({ error: "Часть файла слишком большая" }, { status: 413 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "Пустая часть файла" }, { status: 400 });
  }

  try {
    const fixedLength = new FixedLengthStream(contentLength);
    const controller = new AbortController();
    const uploadPromise = uploadRomPart(key, uploadId, partNumber, fixedLength.readable).catch((error: unknown) => {
      controller.abort(error);
      throw error;
    });
    const [uploadResult, pipeResult] = await Promise.allSettled([
      uploadPromise,
      request.body.pipeTo(fixedLength.writable, { signal: controller.signal }),
    ]);
    if (uploadResult.status === "rejected") throw uploadResult.reason;
    if (pipeResult.status === "rejected") throw pipeResult.reason;
    return NextResponse.json({ partNumber: uploadResult.value.partNumber, etag: uploadResult.value.etag });
  } catch (error) {
    console.error("Unable to upload ROM part", error);
    return NextResponse.json({ error: "Не удалось загрузить часть файла" }, { status: 500 });
  }
}
