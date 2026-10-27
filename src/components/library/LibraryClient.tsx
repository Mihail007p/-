"use client";

import { useMemo, useState } from "react";
import type { ClientGame } from "@/lib/types";
import { SYSTEMS } from "@/lib/systems";
import GameCard from "./GameCard";
import UploadModal from "./UploadModal";

export default function LibraryClient({
  initialGames,
  displayName,
}: {
  initialGames: ClientGame[];
  displayName: string;
}) {
  const [games, setGames] = useState(initialGames);
  const [showUpload, setShowUpload] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return games.filter((game) => {
      if (filter === "favorites" && !game.isFavorite) return false;
      if (filter !== "all" && filter !== "favorites" && game.system !== filter) return false;
      if (search && !game.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [games, filter, search]);

  const usedSystems = useMemo(() => {
    const ids = new Set(games.map((g) => g.system));
    return SYSTEMS.filter((s) => ids.has(s.id));
  }, [games]);

  async function toggleFavorite(game: ClientGame) {
    const next = !game.isFavorite;
    setGames((prev) => prev.map((g) => (g.id === game.id ? { ...g, isFavorite: next } : g)));
    await fetch(`/api/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: next }),
    });
  }

  async function deleteGame(game: ClientGame) {
    if (!confirm(`Удалить «${game.title}»? Это действие необратимо.`)) return;
    setGames((prev) => prev.filter((g) => g.id !== game.id));
    await fetch(`/api/games/${game.id}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-400">С возвращением, {displayName} 👋</p>
          <h1 className="text-3xl font-bold text-white">Моя библиотека</h1>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 rounded-full bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500"
        >
          <span aria-hidden>＋</span> Добавить игру
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1.5 text-sm ${filter === "all" ? "bg-violet-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            Все
          </button>
          <button
            onClick={() => setFilter("favorites")}
            className={`rounded-full px-3 py-1.5 text-sm ${filter === "favorites" ? "bg-violet-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            ★ Избранное
          </button>
          {usedSystems.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${filter === s.id ? "bg-violet-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              {s.emoji} {s.shortLabel}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию…"
          className="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white outline-none focus:border-violet-500 sm:w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/15 py-20 text-center">
          <span className="text-5xl">🗃️</span>
          <p className="text-lg font-semibold text-white">
            {games.length === 0 ? "Библиотека пуста" : "Ничего не найдено"}
          </p>
          <p className="max-w-sm text-sm text-slate-400">
            {games.length === 0
              ? "Загрузите свой первый ROM-файл, чтобы начать играть прямо в браузере."
              : "Попробуйте изменить фильтр или поисковый запрос."}
          </p>
          {games.length === 0 && (
            <button
              onClick={() => setShowUpload(true)}
              className="mt-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Добавить игру
            </button>
          )}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((game) => (
            <GameCard key={game.id} game={game} onToggleFavorite={toggleFavorite} onDelete={deleteGame} />
          ))}
        </div>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onCreated={(game) => {
            setGames((prev) => [game, ...prev]);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}
