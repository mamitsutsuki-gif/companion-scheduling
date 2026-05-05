"use client";

import { AuthNavLink, AuthPrimaryButton, AuthShell, authFieldClass } from "@/components/auth-shell";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fd.get("email"),
      }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "送信に失敗しました。");
      return;
    }
    setMessage(
      "ご登録のメールが存在する場合、再設定用のリンクを送りました。メールをご確認ください。",
    );
  }

  return (
    <AuthShell
      title="パスワード再設定"
      subtitle="ログインに使っているメールアドレスを入力してください。有効なアカウントにのみメールを送ります。"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block space-y-2 text-sm font-medium text-zinc-900">
          メールアドレス
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={authFieldClass}
          />
        </label>
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        {message ? <p className="text-sm leading-relaxed text-emerald-800">{message}</p> : null}
        <AuthPrimaryButton disabled={loading}>{loading ? "送信中…" : "再設定リンクを送信"}</AuthPrimaryButton>
      </form>
      <p className="mt-10 border-t border-zinc-100 pt-8 text-center">
        <AuthNavLink href="/login">← ログインへ戻る</AuthNavLink>
      </p>
    </AuthShell>
  );
}
