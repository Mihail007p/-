import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();

  const [updated] = await db
    .update(games)
    .set({ playCount: sql`${games.playCount} + 1`, lastPlayedAt: new Date() })
    .where(and(eq(games.id, id), eq(games.ownerId, user.id)))
    .returning({ id: games.id });

  if (!updated) {
    return NextResponse.json({ error: "Игра не найдена" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
