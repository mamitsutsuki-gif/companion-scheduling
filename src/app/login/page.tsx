"use client";

import {
  AuthNavLink,
  AuthPrimaryButton,
  AuthShell,
  authFieldClass,
} from "@/components/auth-shell";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";

function oauthErrorMessage(code: string | null) {
  if (!code) return null;
  const map: Record<string, string> = {
    oauth_unconfigured:
      "Google ログインが未設定です。.env に GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / APP_ORIGIN を設定してください。",
    oauth_missing: "ログイン情報が不足しました。もう一度お試しください。",
    oauth_state: "セキュリティ確認に失敗しました。最初からやり直してください。",
    oauth_token: "Google との連携に失敗しました。しばらくしてから再試行してください。",
    oauth_unverified: "Google メールの確認が取れていません。",
    oauth_error: "ログイン処理でエラーが発生しました。",
  };
  return map[code] ?? `エラー: ${code}`;
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";
  const urlError = oauthErrorMessage(search.get("error"));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const googleHref = useMemo(() => {
    const n = next.startsWith("/") ? next : "/dashboard";
    return `/api/auth/google?next=${encodeURIComponent(n)}`;
  }, [next]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
      }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "ログインに失敗しました。");
      return;
    }
    router.push(next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  const showError = urlError ?? error;

  return (
    <AuthShell
      title="ログイン"
      subtitle="メールとパスワード、または Google アカウントでサインインできます。"
    >
      <Link
        href={googleHref}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-xs no-underline transition hover:bg-slate-50"
      >
        <svg className="h-5 w-5" aria-hidden viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Google でログイン
      </Link>
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-3 font-medium text-slate-400">または</span>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          メールアドレス
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={authFieldClass}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          パスワード
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={authFieldClass}
          />
        </label>
        {showError ? <p className="text-sm font-medium text-red-700">{showError}</p> : null}
        <AuthPrimaryButton disabled={loading}>{loading ? "送信中…" : "ログイン"}</AuthPrimaryButton>
      </form>
      <nav className="mt-10 flex flex-col gap-4 border-t border-slate-100 pt-8 text-center">
        <AuthNavLink href="/forgot-password">パスワードをお忘れの場合</AuthNavLink>
        <p className="text-sm text-slate-600">
          はじめての方は{" "}
          <AuthNavLink href="/register" className="inline-block">
            新規登録
          </AuthNavLink>
        </p>
      </nav>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="px-6 py-14 text-center text-sm text-slate-600">準備中…</div>}>
      <LoginInner />
    </Suspense>
  );
}
