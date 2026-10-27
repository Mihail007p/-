import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { games } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getSystem } from "@/lib/systems";
import EmulatorPlayer from "@/components/play/EmulatorPlayer";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.ownerId, user.id)))
    .limit(1);
  const game = rows[0];
  if (!game) notFound();

  const system = getSystem(game.system);
  if (!system) notFound();

  return (
    <EmulatorPlayer
      gameId={game.id}
      title={game.title}
      core={system.core}
      romUrl={`/api/games/${game.id}/rom`}
      romFilename={game.romFilename}
    />
  );
}
