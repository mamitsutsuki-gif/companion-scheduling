"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type RoleUser = {
  id: string;
  displayName: string;
  role: string;
  email: string;
  companyId?: string | null;
};

type LinkRow = {
  id: string;
  supervisorId: string;
  clientId: string;
  companyId: string;
  programId: string | null;
  createdAt: string;
  supervisorName: string;
  supervisorEmail: string;
  clientName: string;
  clientEmail: string;
};

type Props = {
  users: RoleUser[];
  companies: { id: string; name: string }[];
  canWrite: boolean;
};

function withHonorificSan(name: string) {
  return `${name}さん`;
}

export function AdminSupervisorLinksSection({ users, companies, canWrite }: Props) {
  const [companyId, setCompanyId] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [supervisorId, setSupervisorId] = useState("");
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const companyUsers = useMemo(
    () => users.filter((u) => (u.companyId ?? "").trim() === companyId),
    [users, companyId],
  );
  const supervisors = useMemo(
    () => companyUsers.filter((u) => u.role === "CLIENT_ADMIN" || u.role === "CLIENT_HR"),
    [companyUsers],
  );
  const clients = useMemo(
    () => companyUsers.filter((u) => u.role === "CLIENT"),
    [companyUsers],
  );

  const reload = useCallback(async () => {
    if (!companyId) {
      setLinks([]);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(
      `/api/admin/supervisor-links?companyId=${encodeURIComponent(companyId)}`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "取得に失敗しました。");
      return;
    }
    setLinks(Array.isArray(data?.links) ? data.links : []);
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setSupervisorId("");
    setClientId("");
  }, [companyId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/supervisor-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supervisorId, clientId, companyId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "登録に失敗しました。");
      return;
    }
    setMessage("上司と部下を紐づけました。");
    setClientId("");
    void reload();
  }

  async function onDelete(linkId: string, label: string) {
    if (!canWrite) return;
    if (!window.confirm(`${label} の紐づけを解除しますか？`)) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/supervisor-links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "解除に失敗しました。");
      return;
    }
    setMessage("紐づけを解除しました。");
    void reload();
  }

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8">
      <h2 className="text-lg font-semibold text-slate-950">上司割当（シート閲覧）</h2>
      <p className="mt-2 text-sm text-zinc-600">
        個別伴走の上司はマッチとは別に紐づけます。上司は部下のパートナールームの伴走シート（スキルチェック・FTA
        等）だけを開けます。チャットや1on1セッションには入りません。
      </p>

      <div className="mt-6">
        <label className="block text-sm font-semibold text-zinc-900">企業</label>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="mt-2 w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm"
        >
          <option value="">選択してください</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
      {message ? <p className="mt-4 text-sm font-medium text-emerald-800">{message}</p> : null}

      {companyId && canWrite ? (
        <form className="mt-6 grid gap-4 md:grid-cols-3" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            <span className="font-semibold text-zinc-900">上司（CLIENT_ADMIN）</span>
            <select
              required
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">選択</option>
              {supervisors.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}（{u.email}）
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-zinc-900">部下（CLIENT）</span>
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">選択</option>
              {clients.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}（{u.email}）
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              紐づけを追加
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-8 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">上司</th>
              <th className="py-2 pr-3 font-medium">部下</th>
              <th className="py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {links.map((row) => (
              <tr key={row.id} className="border-b border-slate-100">
                <td className="py-2.5 pr-3">
                  <p className="font-medium text-slate-900">
                    {withHonorificSan(row.supervisorName)}
                  </p>
                  <p className="text-xs text-slate-500">{row.supervisorEmail}</p>
                </td>
                <td className="py-2.5 pr-3">
                  <p className="font-medium text-slate-900">{withHonorificSan(row.clientName)}</p>
                  <p className="text-xs text-slate-500">{row.clientEmail}</p>
                </td>
                <td className="py-2.5">
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() =>
                        void onDelete(
                          row.id,
                          `${row.supervisorName} → ${row.clientName}`,
                        )
                      }
                      className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
                    >
                      解除
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">閲覧のみ</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!companyId ? (
          <p className="mt-4 text-sm text-slate-500">企業を選択すると一覧が表示されます。</p>
        ) : loading ? (
          <p className="mt-4 text-sm text-slate-500">読込中…</p>
        ) : links.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">この企業の上司割当はまだありません。</p>
        ) : null}
      </div>
    </section>
  );
}
