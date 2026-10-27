"use client";

import { useState, type FormEvent } from "react";
import { SYSTEMS } from "@/lib/systems";
import type { ClientGame } from "@/lib/types";

type UploadSession = {
  gameId: string;
  key: string;
  uploadId: string;
  partSize: number;
  coverStoragePath: string | null;
  coverFilename: string | null;
};

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
  const [progress, setProgress] = useState(0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setProgress(0);
    if (!romFile) {
      setError("Выберите файл ROM");
      return;
    }

    setLoading(true);
    let session: UploadSession | null = null;
    let completed = false;

    try {
      const metadata = new FormData();
      metadata.set("title", title);
      metadata.set("system", system);
      metadata.set("romFilename", romFile.name);
      metadata.set("romSizeBytes", String(romFile.size));
      if (coverFile) metadata.set("cover", coverFile);

      const startResponse = await fetch("/api/games/upload/start", { method: "POST", body: metadata });
      const startData = (await startResponse.json().catch(() => ({}))) as Partial<UploadSession> & { error?: string };
      if (!startResponse.ok) throw new Error(startData.error ?? "Не удалось начать загрузку игры");
      if (
        typeof startData.gameId !== "string" ||
        typeof startData.key !== "string" ||
        typeof startData.uploadId !== "string" ||
        typeof startData.partSize !== "number"
      ) {
        throw new Error("Сервер вернул некорректные данные загрузки");
      }
      session = {
        gameId: startData.gameId,
        key: startData.key,
        uploadId: startData.uploadId,
        partSize: startData.partSize,
        coverStoragePath: typeof startData.coverStoragePath === "string" ? startData.coverStoragePath : null,
        coverFilename: typeof startData.coverFilename === "string" ? startData.coverFilename : null,
      };

      const partCount = Math.ceil(romFile.size / session.partSize);
      const parts: Array<{ partNumber: number; etag: string }> = [];
      for (let index = 0; index < partCount; index += 1) {
        const partNumber = index + 1;
        const start = index * session.partSize;
        const end = Math.min(start + session.partSize, romFile.size);
        const chunk = romFile.slice(start, end);
        const query = new URLSearchParams({
          key: session.key,
          uploadId: session.uploadId,
          partNumber: String(partNumber),
        });
        const partResponse = await fetch(`/api/games/upload/part?${query}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Chunk-Length": String(chunk.size),
          },
          body: chunk,
        });
        const partData = (await partResponse.json().catch(() => ({}))) as {
          error?: string;
          partNumber?: number;
          etag?: string;
        };
        if (!partResponse.ok) throw new Error(partData.error ?? `Не удалось загрузить часть ${partNumber}`);
        if (typeof partData.partNumber !== "number" || typeof partData.etag !== "string") {
          throw new Error(`Сервер вернул некорректную часть ${partNumber}`);
        }
        parts.push({ partNumber: partData.partNumber, etag: partData.etag });
        setProgress(Math.round((partNumber / partCount) * 100));
      }

      const completeResponse = await fetch("/api/games/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: session.gameId,
          key: session.key,
          uploadId: session.uploadId,
          parts,
          title,
          system,
          romFilename: romFile.name,
          romSizeBytes: romFile.size,
          coverStoragePath: session.coverStoragePath,
          coverFilename: session.coverFilename,
        }),
      });
      const completeData = (await completeResponse.json().catch(() => ({}))) as {
        error?: string;
        game?: {
          id: string;
          title: string;
          system: string;
          romFilename: string;
          romSizeBytes: number;
          coverStoragePath: string | null;
          isFavorite: boolean;
          playCount: number;
          lastPlayedAt: string | null;
          createdAt: string;
        };
      };
      if (!completeResponse.ok) throw new Error(completeData.error ?? "Не удалось сохранить игру");
      if (!completeData.game) throw new Error("Сервер не вернул созданную игру");

      completed = true;
      const game = completeData.game;
      onCreated({
        id: game.id,
        title: game.title,
        system: game.system,
        romFilename: game.romFilename,
        romSizeBytes: game.romSizeBytes,
        hasCover: Boolean(game.coverStoragePath),
        isFavorite: Boolean(game.isFavorite),
        playCount: Number(game.playCount),
        lastPlayedAt: game.lastPlayedAt,
        createdAt: game.createdAt,
      });
    } catch (caught) {
      if (session && !completed) {
        await fetch("/api/games/upload/abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: session.key,
            uploadId: session.uploadId,
            coverStoragePath: session.coverStoragePath,
          }),
        }).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : "Ошибка сети при загрузке");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Добавить игру</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white disabled:opacity-40"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Название</label>
            <input
              required
              maxLength={120}
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
              disabled={loading}
              onChange={(e) => setRomFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
            <p className="mt-1 text-xs text-slate-500">
              Допустимые расширения: {SYSTEMS.find((s) => s.id === system)?.extensions.join(", ")}. Максимум 500 МБ; файл отправляется частями.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Обложка (необязательно)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={loading}
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
          </div>

          {loading && (
            <div aria-live="polite" className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-slate-400">Загружено {progress}%</p>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={onClose}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:text-white disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {loading ? `Загружаем… ${progress}%` : "Загрузить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
