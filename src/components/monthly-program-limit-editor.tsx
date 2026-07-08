"use client";

import { useCallback, useEffect, useState } from "react";

export function MonthlyProgramLimitEditor({ programId }: { programId: string }) {
  const [limit, setLimit] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/monthly-session", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    const v = data?.settings?.monthlyLimitsByProgramId?.[programId];
    setLimit(typeof v === "number" && v > 0 ? v : 20);
  }, [programId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/monthly-session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programMonthlyLimit: { programId, limit: Math.max(1, Math.floor(limit)) },
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "保存に失敗しました。");
      return;
    }
    setMessage("月次上限を保存しました。");
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm sm:p-8">
      <h2 className="text-lg font-semibold text-emerald-950">セッション申し込み · 月次上限</h2>
      <p className="mt-2 text-sm text-emerald-900/90">
        このプログラムに参加するクライアントが、毎月予約できる回数です（例: 20・50）。
      </p>
      {loading ? <p className="mt-3 text-sm text-slate-600">読込中…</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-800">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald-800">{message}</p> : null}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-800">
          1人あたりの月次上限（回）
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 1)}
            className="mt-1 block w-32 rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </section>
  );
}
