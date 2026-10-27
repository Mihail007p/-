import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { deleteStoredFile, isOwnedCoverStoragePath, isOwnedRomStoragePath } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const values = body as Record<string, unknown>;
  const gameId = typeof values.gameId === "string" ? values.gameId : "";
  const romStoragePath = typeof values.romStoragePath === "string" ? values.romStoragePath : null;
  const coverStoragePath = typeof values.coverStoragePath === "string" ? values.coverStoragePath : null;
  if (!gameId) return NextResponse.json({ error: "Не указана игра" }, { status: 400 });
  if (romStoragePath && !isOwnedRomStoragePath(romStoragePath, user.id, gameId)) {
    return NextResponse.json({ error: "Некорректный путь к ROM" }, { status: 400 });
  }
  if (coverStoragePath && !isOwnedCoverStoragePath(coverStoragePath, user.id, gameId)) {
    return NextResponse.json({ error: "Некорректный путь к обложке" }, { status: 400 });
  }

  const db = await getDb();
  const rows = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.ownerId, user.id), eq(games.id, gameId)))
    .limit(1);
  if (rows[0]) return NextResponse.json({ ok: true });

  await Promise.all([deleteStoredFile(romStoragePath), deleteStoredFile(coverStoragePath)]);
  return NextResponse.json({ ok: true });
}
