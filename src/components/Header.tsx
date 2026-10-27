import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import InstallPwaButton from "./InstallPwaButton";
import LogoutButton from "./LogoutButton";

export default async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href={user ? "/library" : "/"} className="flex items-center gap-2 text-white">
          <span className="text-2xl" aria-hidden>
            🎮
          </span>
          <span className="text-lg font-bold tracking-tight">CloudArcade</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <InstallPwaButton />
          {user ? (
            <>
              <Link
                href="/library"
                className="hidden rounded-full px-3 py-2 text-sm font-medium text-slate-200 hover:text-white sm:block"
              >
                Моя библиотека
              </Link>
              <span className="hidden text-sm text-slate-400 md:block">{user.displayName}</span>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-2 text-sm font-medium text-slate-200 hover:text-white"
              >
                Войти
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                Регистрация
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
