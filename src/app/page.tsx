import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SYSTEMS } from "@/lib/systems";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/library");
  }

  return (
    <main className="bg-slate-950">
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/images/hero.jpg"
            alt=""
            fill
            priority
            className="object-cover opacity-50"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/80 to-slate-950" />
        </div>

        <div className="mx-auto flex max-w-6xl flex-col items-start px-6 pb-24 pt-20 sm:pt-28">
          <p className="rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-violet-300">
            Браузерная эмуляция · PWA-приложение
          </p>
          <h1 className="mt-6 max-w-3xl text-[clamp(2.2rem,6vw,4rem)] font-extrabold leading-[1.05] text-white">
            Играйте в свои игры прямо в браузере — и установите платформу на телефон
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-300">
            CloudArcade — личная облачная библиотека игр. Загрузите свои ROM-файлы (NES, SNES, Game Boy, GBA,
            Sega, PlayStation и другие), и запускайте их через мощный WebAssembly-эмулятор без установки
            сторонних программ. Приложение можно поставить на Android и iOS прямо с главного экрана, как
            обычное приложение.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/register"
              className="rounded-full bg-violet-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500"
            >
              Начать бесплатно
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/20 px-6 py-3 text-base font-semibold text-white transition hover:border-white/40"
            >
              У меня уже есть аккаунт
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Используйте только те игры, на которые у вас есть законные права (ваши собственные дампы, homebrew
            или freeware).
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Как это работает</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: "⬆️",
              title: "1. Загрузите ROM",
              text: "Добавьте файл игры и выберите систему — платформа сама подберёт нужное эмуляторное ядро.",
            },
            {
              icon: "🕹️",
              title: "2. Играйте в браузере",
              text: "Эмуляция работает на WebAssembly прямо на вашем устройстве — быстро и без установки программ.",
            },
            {
              icon: "📲",
              title: "3. Установите на телефон",
              text: "Нажмите «Установить приложение» — CloudArcade появится на главном экране как нативное приложение.",
            },
          ].map((step) => (
            <div key={step.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-3xl">{step.icon}</div>
              <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="text-2xl font-bold text-white sm:text-3xl">Поддерживаемые системы</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {SYSTEMS.map((system) => (
            <span
              key={system.id}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
            >
              <span aria-hidden>{system.emoji}</span>
              {system.label}
            </span>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-slate-900/50">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Готовы собрать свою коллекцию?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Регистрация занимает меньше минуты. Ваша библиотека будет доступна с любого устройства.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-block rounded-full bg-violet-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500"
          >
            Создать аккаунт
          </Link>
        </div>
      </section>
    </main>
  );
}
