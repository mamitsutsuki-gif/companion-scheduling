"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AccountPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [initialName, setInitialName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { user?: { displayName?: string } } | null;
        if (!res.ok || !json?.user?.displayName) {
          if (!cancelled) setError("プロフィールを読み込めませんでした。");
          return;
        }
        if (!cancelled) {
          setDisplayName(json.user.displayName);
          setInitialName(json.user.displayName);
        }
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
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const name = displayName.trim();
    if (!name) {
      setError("表示名を入力してください。");
      return;
    }
    if (name === initialName.trim()) {
      setMessage("変更はありません。");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? "保存に失敗しました。");
        return;
      }
      setInitialName(name);
      setMessage("保存しました。");
      router.refresh();
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600 shadow-sm">
        読込中…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Account</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">マイアカウント</h1>
        <p className="mt-2 text-sm text-slate-600">
          表示名はマッチルームやホーム画面で相手に表示されます（メールアドレスは表示されません）。
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          表示名
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        {message ? <p className="text-sm font-medium text-emerald-800">{message}</p> : null}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-60"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-600">
        <Link href="/dashboard" className="font-medium text-indigo-700 underline-offset-4 hover:underline">
          ← ホームへ戻る
        </Link>
      </p>
    </div>
  );
}
