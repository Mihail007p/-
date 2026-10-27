import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { existsSync } from "fs";
import { db } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { readFileAsWebStream, getFileSize } from "@/lib/storage";

export const runtime = "nodejs";

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
  if (!game || !existsSync(game.romStoragePath)) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }

  const size = await getFileSize(game.romStoragePath);
  const stream = readFileAsWebStream(game.romStoragePath);

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(game.romFilename)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
