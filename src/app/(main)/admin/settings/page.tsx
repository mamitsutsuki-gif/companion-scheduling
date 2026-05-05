"use client";

import { FormEvent, useEffect, useState } from "react";

type UserRow = {
  id: string;
  displayName: string;
  email: string;
  role: "ADMIN" | "PARTNER" | "CLIENT";
};

export default function AdminAppSettingsPage() {
  const [minutes, setMinutes] = useState(30);
  const [totalSessions, setTotalSessions] = useState(6);
  const [timezone, setTimezone] = useState("Asia/Tokyo");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [adminUserId, setAdminUserId] = useState("");

  useEffect(() => {
    async function load() {
      const [sRes, uRes] = await Promise.all([
        fetch("/api/admin/app-settings"),
        fetch("/api/admin/users"),
      ]);
      const sData = await sRes.json().catch(() => null);
      const uData = await uRes.json().catch(() => null);
      if (!sRes.ok) {
        setErr(sData?.error ?? "読込に失敗しました。");
        setLoading(false);
        return;
      }
      if (!uRes.ok) {
        setErr(uData?.error ?? "ユーザー一覧の取得に失敗しました。");
        setLoading(false);
        return;
      }
      if (sData?.settings) {
        setMinutes(sData.settings.slotDurationMinutes);
        setTotalSessions(typeof sData.settings.totalSessions === "number" ? sData.settings.totalSessions : 6);
        setTimezone(sData.settings.timezone);
      }
      setUsers(Array.isArray(uData?.users) ? uData.users : []);
      setLoading(false);
    }
    void load();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const res = await fetch("/api/admin/app-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotDurationMinutes: Number(minutes),
        totalSessions: Number(totalSessions),
        timezone,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error ?? "保存に失敗しました。");
      return;
    }
    setMsg("保存しました。以降に提示される日程候補の長さが変わります。");
  }

  async function onAddAdmin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (!adminUserId) return setErr("管理者にするユーザーを選択してください。");

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: adminUserId, role: "ADMIN" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error ?? "管理者追加に失敗しました。");
      return;
    }
    setMsg("管理者を追加しました。");
    setAdminUserId("");
    const uRes = await fetch("/api/admin/users");
    const uData = await uRes.json().catch(() => null);
    if (uRes.ok) setUsers(Array.isArray(uData?.users) ? uData.users : []);
  }

  if (loading) {
    return <p className="text-sm text-slate-600">読込中…</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Administrator</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">アプリ設定</h1>
        <p className="mt-3 text-sm text-slate-600">
          日程候補の「終了時刻」はここで指定した分だけ開始から自動計算されます。パートナーは開始のみ選びます。
        </p>
      </header>

      <form
        className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8"
        onSubmit={onSubmit}
      >
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          ミーティング枠の長さ（分）
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
          >
            {[15, 20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} 分枠
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2 text-sm font-medium text-slate-900">
          今回プロジェクトで実施する1on1回数
          <select
            value={totalSessions}
            onChange={(e) => setTotalSessions(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((count) => (
              <option key={count} value={count}>
                全 {count} 回
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2 text-sm font-medium text-slate-900">
          表示・案内で使うタイムゾーン（IANA）
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-xs"
            placeholder="Asia/Tokyo"
          />
          <span className="block text-xs font-normal text-slate-500">
            ログやメール内の説明テキスト用です。参加者の入力はブラウザのローカル時刻のまま扱われます。
          </span>
        </label>

        {err ? <p className="text-sm text-red-700">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}

        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          保存
        </button>
      </form>

      <form
        className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8"
        onSubmit={onAddAdmin}
      >
        <h2 className="text-lg font-semibold text-slate-900">管理者の追加</h2>
        <p className="text-sm text-slate-600">既存ユーザーを管理者ロール（ADMIN）に変更します。</p>
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          追加するユーザー
          <select
            value={adminUserId}
            onChange={(e) => setAdminUserId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
          >
            <option value="">選択してください</option>
            {users.filter((u) => u.role !== "ADMIN").map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}（{u.email}）
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-xl border border-indigo-300 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm hover:bg-indigo-100"
        >
          管理者に追加
        </button>
      </form>
    </div>
  );
}
