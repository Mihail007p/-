import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { deleteStoredFile } from "@/lib/storage";

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
  const db = await getDb();
  const rows = await db
    .select({ id: games.id })
    .from(games)
    .where(and(eq(games.id, id), eq(games.ownerId, user.id)))
    .limit(1);
  if (!rows[0]) {
    return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const values = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const updates: Partial<typeof games.$inferInsert> = {};
  if (typeof values.isFavorite === "boolean") updates.isFavorite = values.isFavorite;
  if (typeof values.title === "string" && values.title.trim()) updates.title = values.title.trim();

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
  }

  const [updated] = await db
    .update(games)
    .set(updates)
    .where(and(eq(games.id, id), eq(games.ownerId, user.id)))
    .returning();
  return NextResponse.json({ game: updated });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
  }

  await db.delete(games).where(and(eq(games.id, id), eq(games.ownerId, user.id)));
  await deleteStoredFile(game.romStoragePath);
  await deleteStoredFile(game.coverStoragePath);

  return NextResponse.json({ ok: true });
}
