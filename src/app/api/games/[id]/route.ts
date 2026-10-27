import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { deleteStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

async function loadOwnedGame(gameId: string, userId: string) {
  const rows = await db
    .select()
    .from(games)
    .where(and(eq(games.id, gameId), eq(games.ownerId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const game = await loadOwnedGame(id, user.id);
  if (!game) {
    return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
  }
  return NextResponse.json({ game });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const game = await loadOwnedGame(id, user.id);
  if (!game) {
    return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Partial<typeof games.$inferInsert> = {};

  if (typeof body.isFavorite === "boolean") {
    updates.isFavorite = body.isFavorite;
  }
  if (typeof body.title === "string" && body.title.trim()) {
    updates.title = body.title.trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
  }

  const [updated] = await db.update(games).set(updates).where(eq(games.id, id)).returning();
  return NextResponse.json({ game: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const game = await loadOwnedGame(id, user.id);
  if (!game) {
    return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
  }

  await db.delete(games).where(eq(games.id, id));
  await deleteStoredFile(game.romStoragePath);
  await deleteStoredFile(game.coverStoragePath);

  return NextResponse.json({ ok: true });
}
