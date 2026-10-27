export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center text-slate-100">
      <div>
        <p className="text-5xl">📡</p>
        <h1 className="mt-4 text-2xl font-semibold">Нет подключения к интернету</h1>
        <p className="mt-2 text-slate-400">
          Проверьте соединение и обновите страницу. Ваша библиотека игр появится снова онлайн.
        </p>
      </div>
    </main>
  );
}
