import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import type { ClientGame } from "@/lib/types";
import LibraryClient from "@/components/library/LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await db
    .select()
    .from(games)
    .where(eq(games.ownerId, user.id))
    .orderBy(desc(games.lastPlayedAt), desc(games.createdAt));

  const initialGames: ClientGame[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    system: row.system,
    romFilename: row.romFilename,
    romSizeBytes: row.romSizeBytes,
    hasCover: Boolean(row.coverStoragePath),
    isFavorite: row.isFavorite,
    playCount: row.playCount,
    lastPlayedAt: row.lastPlayedAt ? row.lastPlayedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <main className="min-h-screen bg-slate-950">
      <LibraryClient initialGames={initialGames} displayName={user.displayName} />
    </main>
  );
}
