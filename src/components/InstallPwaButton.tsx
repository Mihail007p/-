"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const subscribeToNothing = () => () => {};

function subscribeToStandaloneMode(onChange: () => void) {
  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getStandaloneSnapshot() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getIosSnapshot() {
  const userAgent = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
}

export default function InstallPwaButton() {
  const isStandalone = useSyncExternalStore(subscribeToStandaloneMode, getStandaloneSnapshot, () => false);
  const isIos = useSyncExternalStore(subscribeToNothing, getIosSnapshot, () => false);
  const [installedByEvent, setInstalledByEvent] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalledByEvent(true);
      setDeferredPrompt(null);
      setShowInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isStandalone || installedByEvent) return null;

  async function handleClick() {
    if (!deferredPrompt) {
      setShowInstructions((visible) => !visible);
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalledByEvent(true);
    } catch {
      setShowInstructions(true);
    } finally {
      setDeferredPrompt(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={showInstructions}
        aria-controls="pwa-install-instructions"
        className="flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500 active:scale-95"
      >
        <span aria-hidden>📲</span> Установить приложение
      </button>
      {showInstructions && (
        <div
          id="pwa-install-instructions"
          role="status"
          className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs leading-relaxed text-slate-200 shadow-xl sm:w-80"
        >
          {isIos ? (
            <>
              В Safari нажмите <span className="font-semibold">Поделиться</span>, затем выберите
              <span className="font-semibold"> «На экран “Домой”»</span>.
            </>
          ) : (
            <>
              В Chrome или Edge откройте меню браузера и выберите
              <span className="font-semibold"> «Установить приложение»</span> или
              <span className="font-semibold"> «Добавить на главный экран»</span>. Для установки сайт должен
              открываться по HTTPS (на компьютере также подходит localhost).
            </>
          )}
        </div>
      )}
    </div>
  );
}
