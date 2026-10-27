"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "login" | "register";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "login" ? { email, password } : { email, password, displayName };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Что-то пошло не так");
        return;
      }
      router.push("/library");
      router.refresh();
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white">
          {isRegister ? "Создать аккаунт" : "Вход в CloudArcade"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {isRegister
            ? "Соберите собственную облачную библиотеку игр."
            : "Рады видеть вас снова!"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {isRegister && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Имя</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-white outline-none focus:border-violet-500"
                placeholder="Как к вам обращаться"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-white outline-none focus:border-violet-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Пароль</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-white outline-none focus:border-violet-500"
              placeholder="Минимум 6 символов"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
          >
            {loading ? "Подождите…" : isRegister ? "Зарегистрироваться" : "Войти"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {isRegister ? (
            <>
              Уже есть аккаунт?{" "}
              <Link href="/login" className="font-semibold text-violet-300 hover:text-violet-200">
                Войти
              </Link>
            </>
          ) : (
            <>
              Ещё нет аккаунта?{" "}
              <Link href="/register" className="font-semibold text-violet-300 hover:text-violet-200">
                Зарегистрироваться
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
