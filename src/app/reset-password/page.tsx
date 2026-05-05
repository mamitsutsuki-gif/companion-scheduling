"use client";

import { AuthNavLink, AuthPrimaryButton, AuthShell, authFieldClass } from "@/components/auth-shell";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function ResetInner() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const pw = fd.get("password");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: token || fd.get("token"),
        password: pw,
      }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "再設定に失敗しました。");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  if (!token) {
    return (
      <AuthShell title="リンクが無効です" subtitle="メール記載の再設定リンクから開き直してください。">
        <p className="text-sm text-zinc-600">トークンが URL に含まれていません。</p>
        <div className="mt-10">
          <AuthNavLink href="/login">ログインへ</AuthNavLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="新しいパスワードを設定" subtitle="8文字以上のパスワードを入力してください。">
      <form onSubmit={onSubmit} className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <label className="block space-y-2 text-sm font-medium text-zinc-900">
          新しいパスワード
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={authFieldClass}
          />
        </label>
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        <AuthPrimaryButton disabled={loading}>{loading ? "保存中…" : "設定してログインへ"}</AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="px-6 py-14 text-center text-sm text-zinc-600">準備中…</div>}>
      <ResetInner />
    </Suspense>
  );
}
