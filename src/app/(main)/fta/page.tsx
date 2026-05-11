"use client";

import { FtaEditor, FtaViewer } from "@/components/fta-chart";
import { defaultFtaChart, type FtaChart } from "@/lib/fta";
import { useCallback, useEffect, useState } from "react";

type ViewerRow = { userId: string; displayName: string; chart: FtaChart };

export default function FtaPage() {
  const [chart, setChart] = useState<FtaChart>(defaultFtaChart());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [others, setOthers] = useState<ViewerRow[]>([]);
  const [scopeMessage, setScopeMessage] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    const res = await fetch("/api/fta/me", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.chart) {
      setChart(data.chart);
      setDirty(false);
    }
  }, []);

  const loadOthers = useCallback(async () => {
    const cRes = await fetch("/api/fta/clients", { cache: "no-store" });
    const cData = await cRes.json().catch(() => null);
    if (cRes.ok && Array.isArray(cData?.charts)) setOthers(cData.charts);
    setScopeMessage(
      cRes.ok && typeof cData?.message === "string" ? cData.message : null,
    );
  }, []);

  useEffect(() => {
    void loadMine();
    void loadOthers();
  }, [loadMine, loadOthers]);

  useEffect(() => {
    // 他クライアント閲覧リストは定期更新する（自分の入力値は上書きしない）。
    const id = window.setInterval(() => {
      void loadOthers();
    }, 2000);
    return () => window.clearInterval(id);
  }, [loadOthers]);

  useEffect(() => {
    // 入力内容を2秒ごとに自動保存する。
    if (!dirty || saving) return;
    const id = window.setTimeout(async () => {
      setSaving(true);
      const res = await fetch("/api/fta/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chart }),
      });
      const data = await res.json().catch(() => null);
      setSaving(false);
      if (!res.ok) {
        setMsg(data?.error ?? "自動保存に失敗しました。");
        return;
      }
      if (data?.chart) setChart(data.chart);
      setDirty(false);
      setMsg("自動保存しました。");
      void loadOthers();
    }, 2000);
    return () => window.clearTimeout(id);
  }, [chart, dirty, saving, loadOthers]);

  function onEdit(next: FtaChart) {
    setChart(next);
    setDirty(true);
    setMsg(null);
  }

  async function onSave() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/fta/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setMsg(data?.error ?? "保存に失敗しました。");
      return;
    }
    if (data?.chart) setChart(data.chart);
    setDirty(false);
    void loadOthers();
    setMsg("保存しました。");
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">自分FTA</h1>
        <p className="mt-2 text-base text-slate-600">中心(A)→要素(B)→アクション(C)の順で記入します。鍵マークで非公開にできます。</p>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
        <FtaEditor chart={chart} onChange={onEdit} />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
          {dirty ? <span className="text-xs text-amber-700">未保存の変更があります（2秒後に自動保存）</span> : null}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-base font-semibold text-slate-900">プレビュー（保存内容の見え方）</h2>
          <p className="mt-1 text-xs text-slate-600">保存後、この表示がそのまま閲覧側に反映されます。</p>
          <div className="mt-3">
            <FtaViewer chart={chart} />
          </div>
        </div>
      </section>

      {scopeMessage ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm sm:p-6">
          {scopeMessage}
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            同じ所属企業の他クライアントの自分FTA（非公開は伏せて表示）
          </h2>
          <p className="text-xs text-slate-500">
            ※ 別の所属企業 ID のクライアントの自分FTA は表示されません。
          </p>
          <div className="space-y-6">
            {others.map((row) => (
              <article key={row.userId} className="rounded-xl border border-zinc-200 p-4">
                <h3 className="text-base font-semibold text-zinc-900">{row.displayName}さん</h3>
                <div className="mt-3">
                  <FtaViewer chart={row.chart} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
