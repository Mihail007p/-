"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const EMULATORJS_VERSION = "stable";

declare global {
  interface Window {
    EJS_player?: string;
    EJS_core?: string;
    EJS_gameUrl?: string;
    EJS_pathtodata?: string;
    EJS_gameName?: string;
    EJS_color?: string;
    EJS_backgroundColor?: string;
    EJS_startOnLoaded?: boolean;
    EJS_fullscreenOnLoaded?: boolean;
    EJS_threads?: boolean;
    EJS_emulator?: unknown;
    EJS_ready?: () => void;
    EJS_onGameStart?: () => void;
  }
}

export default function EmulatorPlayer({
  gameId,
  title,
  core,
  romUrl,
  romFilename,
}: {
  gameId: string;
  title: string;
  core: string;
  romUrl: string;
  romFilename: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch(`/api/games/${gameId}/play`, { method: "POST" }).catch(() => undefined);
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;
    const gameContainer = containerRef.current;
    const scriptEl = document.createElement("script");

    window.EJS_player = "#ejs-game-container";
    window.EJS_core = core;
    window.EJS_gameUrl = romUrl;
    window.EJS_pathtodata = `https://cdn.emulatorjs.org/${EMULATORJS_VERSION}/data/`;
    window.EJS_gameName = title;
    window.EJS_color = "#7c3aed";
    window.EJS_backgroundColor = "#020617";
    window.EJS_startOnLoaded = true;
    window.EJS_threads = false;
    window.EJS_ready = () => {
      if (!cancelled) setStatus("ready");
    };

    scriptEl.src = `https://cdn.emulatorjs.org/${EMULATORJS_VERSION}/data/loader.js`;
    scriptEl.async = true;
    scriptEl.onerror = () => {
      if (!cancelled) setStatus("error");
    };
    scriptEl.onload = () => {
      // Loader will create the emulator; mark ready as a fallback in case EJS_ready isn't invoked.
      setTimeout(() => {
        if (!cancelled) setStatus((s) => (s === "loading" ? "ready" : s));
      }, 6000);
    };

    document.body.appendChild(scriptEl);

    return () => {
      cancelled = true;
      document.body.removeChild(scriptEl);
      delete window.EJS_player;
      delete window.EJS_core;
      delete window.EJS_gameUrl;
      delete window.EJS_pathtodata;
      delete window.EJS_gameName;
      delete window.EJS_color;
      delete window.EJS_backgroundColor;
      delete window.EJS_startOnLoaded;
      delete window.EJS_threads;
      delete window.EJS_ready;
      delete window.EJS_emulator;
      if (gameContainer) {
        gameContainer.innerHTML = "";
      }
    };
  }, [gameId, core, romUrl, title]);

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3">
        <Link
          href="/library"
          className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:border-white/30 hover:text-white"
        >
          ← Библиотека
        </Link>
        <div className="truncate text-sm font-semibold text-white">{title}</div>
        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">{romFilename}</span>
      </div>

      <div className="relative flex flex-1 items-center justify-center bg-black">
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-300">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
            <p>Загружаем эмулятор…</p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center text-slate-300">
            <p className="text-3xl">⚠️</p>
            <p>Не удалось загрузить эмулятор. Проверьте подключение к интернету и обновите страницу.</p>
          </div>
        )}
        <div
          id="ejs-game-container"
          ref={containerRef}
          className="aspect-video w-full max-w-5xl bg-black"
        />
      </div>
    </div>
  );
}
