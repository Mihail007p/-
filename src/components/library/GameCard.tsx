"use client";

import Link from "next/link";
import { useState } from "react";
import type { ClientGame } from "@/lib/types";
import { getSystem } from "@/lib/systems";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(value: string | null) {
  if (!value) return "ещё не запускалась";
  const date = new Date(value);
  return `играли ${date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
}

export default function GameCard({
  game,
  onToggleFavorite,
  onDelete,
}: {
  game: ClientGame;
  onToggleFavorite: (game: ClientGame) => void;
  onDelete: (game: ClientGame) => void;
}) {
  const [busy, setBusy] = useState(false);
  const system = getSystem(game.system);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:-translate-y-1 hover:border-violet-400/40 hover:shadow-xl hover:shadow-violet-950/30">
      <Link href={`/play/${game.id}`} className="block">
        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-violet-700/40 via-slate-800 to-slate-900">
          {game.hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/games/${game.id}/cover`}
              alt={game.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-5xl opacity-80">{system?.emoji ?? "🎮"}</span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <div className="absolute inset-0 hidden items-center justify-center group-hover:flex">
            <span className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
              ▶ Играть
            </span>
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-white">{game.title}</h3>
          <button
            aria-label="В избранное"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onToggleFavorite(game);
              setBusy(false);
            }}
            className={`text-lg transition ${game.isFavorite ? "text-amber-400" : "text-slate-500 hover:text-amber-300"}`}
          >
            {game.isFavorite ? "★" : "☆"}
          </button>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">
          {system?.shortLabel ?? game.system}
        </span>
        <p className="mt-1 text-xs text-slate-500">{formatDate(game.lastPlayedAt)}</p>
        <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-500">
          <span>{formatSize(game.romSizeBytes)}</span>
          <button
            onClick={() => onDelete(game)}
            className="text-slate-500 transition hover:text-red-400"
            aria-label="Удалить игру"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
