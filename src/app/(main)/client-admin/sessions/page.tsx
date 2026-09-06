"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  matchId: string;
  sessionNumber: number;
  round: number;
  clientDisplayName: string;
  startAt: string;
  endAt: string;
  hrReflectionPublished?: boolean;
};

type HrReflection = {
  good: string;
  improve: string;
  satisfactionScore: number | null;
  satisfactionReason: string;
};

function formatJa(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type ProgramOption = {
  id: string;
  name: string;
};

function HrReflectionPanel({
  row,
  onClose,
}: {
  row: Row;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientDisplayName, setClientDisplayName] = useState(row.clientDisplayName);
  const [reflection, setReflection] = useState<HrReflection | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          matchId: row.matchId,
          sessionNumber: String(row.sessionNumber),
        });
        const res = await fetch(`/api/client-admin/sessions/hr-reflection?${qs}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
          setReflection(null);
          return;
        }
        if (typeof data?.clientDisplayName === "string") {
          setClientDisplayName(data.clientDisplayName);
        }
        const r = data?.reflection;
        setReflection({
          good: typeof r?.good === "string" ? r.good : "",
          improve: typeof r?.improve === "string" ? r.improve : "",
          satisfactionScore:
            typeof r?.satisfactionScore === "number" ? r.satisfactionScore : null,
          satisfactionReason:
            typeof r?.satisfactionReason === "string" ? r.satisfactionReason : "",
        });
      } catch {
        if (!cancelled) setError("ネットワークエラーが発生しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [row.matchId, row.sessionNumber]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hr-reflection-title"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
              Published reflection
            </p>
            <h2 id="hr-reflection-title" className="mt-1 text-xl font-semibold text-slate-900">
              クライアント振り返り（第{row.sessionNumber}回）
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {clientDisplayName}さん · 閲覧のみ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            閉じる
          </button>
        </div>

        {loading ? <p className="mt-6 text-slate-600">読込中…</p> : null}
        {error ? <p className="mt-6 text-sm font-medium text-red-700">{error}</p> : null}

        {!loading && !error && reflection ? (
          <div className="mt-6 space-y-4">
            <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
              <h3 className="text-base font-semibold text-indigo-950">良かったところ</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {reflection.good.trim() || "（未入力）"}
              </p>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">もっと良くなるところ</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {reflection.improve.trim() || "（未入力）"}
              </p>
            </section>
            <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
              <h3 className="text-base font-semibold text-slate-900">満足度</h3>
              <p className="mt-2 text-sm text-slate-800">
                {reflection.satisfactionScore != null
                  ? `${reflection.satisfactionScore} / 10`
                  : "（未入力）"}
              </p>
            </section>
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-base font-semibold text-slate-900">理由</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {reflection.satisfactionReason.trim() || "（未入力）"}
              </p>
            </section>
            <p className="text-xs leading-relaxed text-slate-500">
              ※ スコア詳細・パートナー評価・マッチルームの他コンテンツは表示されません。
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ClientAdminSessionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [programId, setProgramId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [viewing, setViewing] = useState<Row | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    const qs = programId ? `?programId=${encodeURIComponent(programId)}` : "";
    const res = await fetch(`/api/client-admin/sessions${qs}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setRows(Array.isArray(data?.sessions) ? data.sessions : []);
    setPrograms(Array.isArray(data?.programs) ? data.programs : []);
    if (typeof data?.message === "string") setInfo(data.message);
  }, [programId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const nowMs = Date.now();

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) => {
      const end = new Date(r.endAt).getTime();
      if (!Number.isFinite(end)) return false;
      if (tab === "past") return end < nowMs;
      return end >= nowMs;
    });
    filtered.sort((a, b) =>
      tab === "past"
        ? new Date(b.endAt).getTime() - new Date(a.endAt).getTime()
        : new Date(a.endAt).getTime() - new Date(b.endAt).getTime(),
    );
    return filtered;
  }, [rows, tab, nowMs]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Client Administrator
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          1on1セッション一覧
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          自社のメンバー（クライアント）の確定済みセッション日程を一覧で確認できます。
          プライバシー保護のため、対話パートナーの名前およびセッション内容は表示されません。
          管理者が公開したロールプレイ振り返りがある場合のみ、「振り返りを見る」から確認できます。
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {programs.length > 1 ? (
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span className="font-medium">プログラム</span>
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="min-w-[14rem] rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">すべて</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            再読込
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("upcoming")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === "upcoming"
              ? "bg-indigo-700 text-white"
              : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          これから実施
        </button>
        <button
          type="button"
          onClick={() => setTab("past")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            tab === "past"
              ? "bg-indigo-700 text-white"
              : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          過去
        </button>
      </div>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      {info ? <p className="text-sm font-medium text-amber-800">{info}</p> : null}

      {loading ? (
        <p className="text-slate-600">読込中…</p>
      ) : sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-600">
          該当する確定日程がありません。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm text-slate-800">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-3">回</th>
                <th className="px-3 py-3">クライアント</th>
                <th className="px-3 py-3">開始</th>
                <th className="px-3 py-3">終了</th>
                <th className="px-3 py-3">振り返り</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => (
                <tr
                  key={`${r.matchId}-${r.sessionNumber}-${r.startAt}-${idx}`}
                  className="border-b border-slate-100"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.sessionNumber}回 / R{r.round}
                  </td>
                  <td className="px-3 py-2">{r.clientDisplayName}さん</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatJa(r.startAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatJa(r.endAt)}</td>
                  <td className="px-3 py-2">
                    {r.hrReflectionPublished && r.matchId ? (
                      <button
                        type="button"
                        onClick={() => setViewing(r)}
                        className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-900 hover:bg-indigo-100"
                      >
                        振り返りを見る
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        ※ マッチルームやセッション詳細には遷移しません。公開済みのクライアント振り返りのみ、パネルで確認できます。
      </p>

      {viewing ? <HrReflectionPanel row={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
