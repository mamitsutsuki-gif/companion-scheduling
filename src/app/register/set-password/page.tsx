"use client";

import { AuthPrimaryButton, AuthShell, authFieldClass } from "@/components/auth-shell";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

type VerifiedInfo = {
  email: string;
  displayName: string;
  role: "PARTNER" | "CLIENT";
};

function SetPasswordInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") ?? "";
  const [info, setInfo] = useState<VerifiedInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [nextPath, setNextPath] = useState("/dashboard");

  useEffect(() => {
    if (!token) {
      setLoadError("リンクが不正です。新規登録ページからやり直してください。");
      return;
    }
    async function verify() {
      const res = await fetch(`/api/auth/register-email-verify?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(typeof data?.error === "string" ? data.error : "リンクの検証に失敗しました。");
        return;
      }
      setInfo({
        email: String(data?.email ?? ""),
        displayName: String(data?.displayName ?? ""),
        role: data?.role === "PARTNER" ? "PARTNER" : "CLIENT",
      });
    }
    void verify();
  }, [token]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError("パスワードは10文字以上で入力してください。");
      return;
    }
    if (password !== confirm) {
      setError("確認用パスワードが一致しません。");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/auth/register-email-finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "登録の完了に失敗しました。");
      return;
    }
    setSuccess(true);
    const resolvedNext =
      typeof data?.next === "string" && data.next.startsWith("/")
        ? data.next
        : "/register/complete-profile";
    setNextPath(resolvedNext);
    setTimeout(() => {
      router.push(resolvedNext);
      router.refresh();
    }, 800);
  }

  if (loadError) {
    return (
      <AuthShell title="リンク無効" subtitle="">
        <p className="text-sm text-red-700">{loadError}</p>
      </AuthShell>
    );
  }

  if (!info) {
    return (
      <AuthShell title="パスワード設定" subtitle="">
        <p className="text-sm text-slate-600">リンクを確認しています…</p>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell title="登録が完了しました" subtitle="">
        <p className="text-sm text-emerald-800">
          {nextPath === "/dashboard"
            ? "パスワードを設定しました。ホーム画面に移動します…"
            : "パスワードを設定しました。必須情報の入力画面に移動します…"}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="パスワードを設定"
      subtitle={`${info.email} のパスワードを設定してください。`}
    >
      <form className="space-y-5" onSubmit={onSubmit}>
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          表示名: <span className="font-semibold">{info.displayName}</span>
          <span className="ml-2 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600">
            {info.role === "PARTNER" ? "パートナー" : "クライアント"}
          </span>
        </p>
        <label className="block space-y-2 text-sm font-medium text-zinc-900">
          新しいパスワード（10文字以上）
          <input
            type="password"
            required
            minLength={10}
            maxLength={200}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authFieldClass}
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-zinc-900">
          確認用パスワード
          <input
            type="password"
            required
            minLength={10}
            maxLength={200}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={authFieldClass}
          />
        </label>
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        <AuthPrimaryButton disabled={submitting}>
          {submitting ? "設定中…" : "パスワードを設定する"}
        </AuthPrimaryButton>
      </form>
    </AuthShell>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="px-6 py-14 text-center text-sm text-slate-600">準備中…</div>}
    >
      <SetPasswordInner />
    </Suspense>
  );
}
