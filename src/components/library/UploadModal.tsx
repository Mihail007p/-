"use client";

import { useState, type FormEvent } from "react";
import { SYSTEMS } from "@/lib/systems";
import type { ClientGame } from "@/lib/types";

export default function UploadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (game: ClientGame) => void;
}) {
  const [title, setTitle] = useState("");
  const [system, setSystem] = useState(SYSTEMS[0].id);
  const [romFile, setRomFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!romFile) {
      setError("Выберите файл ROM");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("title", title);
      formData.set("system", system);
      formData.set("rom", romFile);
      if (coverFile) formData.set("cover", coverFile);

      const res = await fetch("/api/games", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось загрузить игру");
        return;
      }
      const game = data.game;
      onCreated({
        id: game.id,
        title: game.title,
        system: game.system,
        romFilename: game.romFilename,
        romSizeBytes: game.romSizeBytes,
        hasCover: Boolean(game.coverStoragePath),
        isFavorite: game.isFavorite,
        playCount: game.playCount,
        lastPlayedAt: game.lastPlayedAt,
        createdAt: game.createdAt,
      });
    } catch {
      setError("Ошибка сети при загрузке");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Добавить игру</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Закрыть">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Название</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white outline-none focus:border-violet-500"
              placeholder="Например: Super Adventure"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Система</label>
            <select
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-white outline-none focus:border-violet-500"
            >
              {SYSTEMS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emoji} {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Файл ROM</label>
            <input
              required
              type="file"
              onChange={(e) => setRomFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
            <p className="mt-1 text-xs text-slate-500">Допустимые расширения: {SYSTEMS.find((s) => s.id === system)?.extensions.join(", ")}</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Обложка (необязательно)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {loading ? "Загружаем…" : "Загрузить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
