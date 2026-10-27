"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-full border border-white/15 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white disabled:opacity-60"
    >
      {loading ? "Выходим…" : "Выйти"}
    </button>
  );
}
