import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { existsSync } from "fs";
import path from "path";
import { db } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { readFileAsWebStream, getFileSize } from "@/lib/storage";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;

  const rows = await db
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.ownerId, user.id)))
    .limit(1);
  const game = rows[0];
  if (!game || !game.coverStoragePath || !existsSync(game.coverStoragePath)) {
    return NextResponse.json({ error: "Обложка не найдена" }, { status: 404 });
  }

  const ext = path.extname(game.coverStoragePath).toLowerCase();
  const size = await getFileSize(game.coverStoragePath);
  const stream = readFileAsWebStream(game.coverStoragePath);

  return new NextResponse(stream, {
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
