import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.ownerId, user.id)))
    .limit(1);
  const game = rows[0];
  if (!game) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  const object = await getStoredFile(game.romStoragePath);
  if (!object || object.statusCode !== 200) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  return new NextResponse(object.stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(object.blob.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(game.romFilename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
