import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const db = await getDb();
  const rows = await db
    .select()
    .from(games)
    .where(eq(games.ownerId, user.id))
    .orderBy(desc(games.lastPlayedAt), desc(games.createdAt));

  return NextResponse.json({ games: rows });
}
