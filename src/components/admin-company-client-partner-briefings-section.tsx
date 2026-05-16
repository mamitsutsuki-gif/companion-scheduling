"use client";

import Link from "next/link";
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

function extractRole(j: unknown): string | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const u = o.user;
  if (u && typeof u === "object") {
    const r = (u as Record<string, unknown>).role;
    if (typeof r === "string") return r;
  }
  if (typeof o.role === "string") return o.role;
  return null;
}

function parseAgeInput(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 120) return { ok: false };
  return { ok: true, value: n };
}

/**
 * 運用 ADMIN のみ表示・API にアクセス。ADMIN_ASSISTANT / それ以外には何もレンダリングしない。
 * - editable: 「企業ごとの設定」内の入力フォーム
 * - readonly: 企業詳細などでの一覧のみ（入力は設定ページへ誘導）
 */
export function AdminCompanyClientPartnerBriefingsSection({
  companyId,
  companyName,
  variant = "editable",
}: {
  companyId: string;
  companyName: string;
  variant?: "editable" | "readonly";
}) {
  const [meResolved, setMeResolved] = useState(false);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, { age: string; jobTitle: string }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isAdmin = meRole === "ADMIN";
  const canEdit = variant === "editable" && isAdmin;

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
        error?: string;
      } | null;
      if (!res.ok) {
        setError(json?.error ?? "取得に失敗しました。");
        setRows([]);
        return;
      }
      applyRows(Array.isArray(json?.clients) ? json!.clients! : []);
    } catch {
      setError("ネットワークエラーが発生しました。");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applyRows, companyId]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (!cancelled) {
          setMeRole(extractRole(j));
          setMeResolved(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!meResolved || meRole !== "ADMIN") return;
    void load();
  }, [meResolved, meRole, load]);

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

  if (!meResolved) {
    return null;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <section
      id="client-partner-briefings"
      className="rounded-2xl border border-slate-300 bg-slate-50/90 p-5 shadow-sm sm:p-8"
    >
      <h2 className="text-lg font-semibold text-slate-900">パートナー共有用クライアント属性（機密）</h2>
      <p className="mt-2 text-sm text-slate-700">
        この企業（<strong>{companyName}</strong>
        ）に所属する<strong>クライアント側ユーザー</strong>（CLIENT / CLIENT_ADMIN /
        CLIENT_HR）です。年齢・役職は<strong>運用 ADMIN のみ</strong>が登録できます。クライアント本人・他ユーザー・管理者アシスタントには表示されません。マッチ先の<strong>パートナー本人</strong>のみ、ルーム「クライアント情報」で参照されます。
      </p>
      {variant === "readonly" ? (
        <p className="mt-2 text-sm text-slate-600">
          <Link
            href={`/admin/companies/${encodeURIComponent(companyId)}/settings#client-partner-briefings`}
            className="font-semibold text-indigo-800 underline-offset-4 hover:underline"
          >
            企業ごとの設定
          </Link>
          で編集してください。
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
          この companyId が付いたクライアント（CLIENT / CLIENT_ADMIN / CLIENT_HR）のユーザーがいません。マッチ管理でユーザーに所属企業を設定しているか確認してください。
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
                        {canEdit ? (
                          <>
                            <label className="sr-only" htmlFor={`age-${r.userId}`}>
                              {r.displayName} の年齢
                            </label>
                            <input
                              id={`age-${r.userId}`}
                              type="number"
                              min={0}
                              max={120}
                              inputMode="numeric"
                              disabled={saving}
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
                          </>
                        ) : (
                          <span className="tabular-nums text-slate-800">
                            {cell.age.trim() !== "" ? cell.age : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {canEdit ? (
                          <>
                            <label className="sr-only" htmlFor={`job-${r.userId}`}>
                              {r.displayName} の役職
                            </label>
                            <input
                              id={`job-${r.userId}`}
                              type="text"
                              maxLength={200}
                              disabled={saving}
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
                          </>
                        ) : (
                          <span className="text-slate-800">{cell.jobTitle.trim() !== "" ? cell.jobTitle : "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {canEdit ? (
            <>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={saving || rows.length === 0}
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
          ) : null}
        </>
      )}
    </section>
  );
}
