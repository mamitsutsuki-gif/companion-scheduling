"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  userId: string;
  displayName: string;
  role: string;
  age: number | null;
  jobTitle: string | null;
};

const roleLabel: Record<string, string> = {
  CLIENT: "クライアント",
  CLIENT_ADMIN: "クライアント管理者",
  CLIENT_HR: "クライアント人事",
};

function parseAgeInput(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 120) return { ok: false };
  return { ok: true, value: n };
}

export function AdminCompanyClientPartnerBriefingsSection({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [meRole, setMeRole] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, { age: string; jobTitle: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dataBackendFirebase, setDataBackendFirebase] = useState(false);

  const canEdit = meRole === "ADMIN";

  const applyRows = useCallback((list: Row[]) => {
    setRows(list);
    const d: Record<string, { age: string; jobTitle: string }> = {};
    for (const x of list) {
      d[x.userId] = {
        age: x.age === null ? "" : String(x.age),
        jobTitle: x.jobTitle ?? "",
      };
    }
    setDraft(d);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/client-partner-briefings`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as {
        clients?: Row[];
        dataBackendFirebase?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(json?.error ?? "取得に失敗しました。");
        setRows([]);
        return;
      }
      applyRows(Array.isArray(json?.clients) ? json!.clients! : []);
      setDataBackendFirebase(json?.dataBackendFirebase === true);
    } catch {
      setError("ネットワークエラーが発生しました。");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applyRows, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (!cancelled) setMeRole(typeof j?.role === "string" ? j.role : null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const updates: { clientUserId: string; age: number | null; jobTitle: string | null }[] = [];
    for (const r of rows) {
      const cell = draft[r.userId];
      if (!cell) continue;
      const parsed = parseAgeInput(cell.age);
      if (!parsed.ok) {
        setError(`${r.displayName}さんの年齢は 0〜120 の整数で入力するか、空にしてください。`);
        setSaving(false);
        return;
      }
      const jobTitle = cell.jobTitle.trim() === "" ? null : cell.jobTitle.trim();
      updates.push({
        clientUserId: r.userId,
        age: parsed.value,
        jobTitle,
      });
    }
    try {
      const res = await fetch(
        `/api/admin/companies/${encodeURIComponent(companyId)}/client-partner-briefings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        },
      );
      const json = (await res.json().catch(() => null)) as {
        clients?: Row[];
        error?: string;
      } | null;
      if (!res.ok) {
        setError(json?.error ?? "保存に失敗しました。");
        return;
      }
      if (Array.isArray(json?.clients)) applyRows(json!.clients!);
      setMessage("保存しました。");
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-300 bg-slate-50/90 p-5 shadow-sm sm:p-8">
      <h2 className="text-lg font-semibold text-slate-900">パートナー共有用クライアント属性（機密）</h2>
      <p className="mt-2 text-sm text-slate-700">
        この企業（<strong>{companyName}</strong>
        ）に所属する<strong>クライアント側ユーザーの一覧</strong>です。各行の
        <strong>年齢・役職</strong>
        は、運用管理者が入力します。この情報は<strong>当該クライアントとマッチしたパートナー本人</strong>のマッチルーム「クライアント情報」タブだけに表示され、クライアント画面や他のユーザーには公開されません。
      </p>
      {canEdit ? null : (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
          閲覧のみです。編集できるのは運用<strong>ADMIN</strong>のみです。
        </p>
      )}
      {dataBackendFirebase ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Firebase データバックエンド構成では、この機能の保存・参照はできません。
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{message}</p>
      ) : null}
      {loading ? (
        <p className="mt-4 text-sm text-slate-600">読込中…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">
          この企業に紐付いたクライアント（CLIENT / CLIENT_ADMIN / CLIENT_HR）のユーザーがいません。
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-[36rem] w-full text-left text-sm text-slate-800">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-3">名前</th>
                  <th className="px-3 py-3">ロール</th>
                  <th className="px-3 py-3">年齢</th>
                  <th className="px-3 py-3">役職</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cell = draft[r.userId] ?? { age: "", jobTitle: "" };
                  return (
                    <tr key={r.userId} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.displayName}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{roleLabel[r.role] ?? r.role}</td>
                      <td className="px-3 py-2 align-top">
                        <label className="sr-only" htmlFor={`age-${r.userId}`}>
                          {r.displayName} の年齢
                        </label>
                        <input
                          id={`age-${r.userId}`}
                          type="number"
                          min={0}
                          max={120}
                          inputMode="numeric"
                          disabled={!canEdit || saving || dataBackendFirebase}
                          value={cell.age}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              [r.userId]: { ...cell, age: e.target.value },
                            }))
                          }
                          placeholder="—"
                          className="w-24 rounded-md border border-slate-300 px-2 py-1.5 tabular-nums disabled:bg-slate-100"
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <label className="sr-only" htmlFor={`job-${r.userId}`}>
                          {r.displayName} の役職
                        </label>
                        <input
                          id={`job-${r.userId}`}
                          type="text"
                          maxLength={200}
                          disabled={!canEdit || saving || dataBackendFirebase}
                          value={cell.jobTitle}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              [r.userId]: { ...cell, jobTitle: e.target.value },
                            }))
                          }
                          placeholder="例: マネジャー"
                          className="w-full min-w-[12rem] max-w-md rounded-md border border-slate-300 px-2 py-1.5 disabled:bg-slate-100"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={!canEdit || saving || dataBackendFirebase || rows.length === 0}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-900 disabled:opacity-50"
            >
              {saving ? "保存中…" : "クライアント属性を保存"}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              再読込
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            年齢・役職とも空にして保存すると、その人の記録は削除されます（パートナー画面では「未入力」になります）。
          </p>
        </>
      )}
    </section>
  );
}
