"use client";

import {
  AuthNavLink,
  AuthPrimaryButton,
  AuthShell,
  authFieldClass,
} from "@/components/auth-shell";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AVAILABILITY_NOTICE,
  DEFAULT_AVAILABILITY_OPTIONS,
  type AvailabilitySlotOption,
} from "@/lib/availability";

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [role, setRole] = useState<"PARTNER" | "CLIENT">("PARTNER");
  const [availabilityOptions, setAvailabilityOptions] = useState<AvailabilitySlotOption[]>(
    DEFAULT_AVAILABILITY_OPTIONS,
  );
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [partnerZoomUrl, setPartnerZoomUrl] = useState("");
  const [partnerZoomMeetingId, setPartnerZoomMeetingId] = useState("");
  const [partnerZoomPass, setPartnerZoomPass] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const googleHref = useMemo(() => {
    const params = new URLSearchParams({
      next: "/dashboard",
      role,
      register: "1",
    });
    if (acceptedLegal) params.set("legal", "1");
    if (role === "CLIENT" && selectedSlotIds.length > 0) {
      params.set("slots", selectedSlotIds.join(","));
    }
    if (role === "PARTNER") {
      const zu = partnerZoomUrl.trim();
      const zid = partnerZoomMeetingId.trim();
      const zp = partnerZoomPass.trim();
      if (zu) params.set("zoomUrl", zu);
      if (zid) params.set("zoomMeetingId", zid);
      if (zp) params.set("zoomPass", zp);
    }
    return `/api/auth/google?${params.toString()}`;
  }, [role, selectedSlotIds, partnerZoomUrl, partnerZoomMeetingId, partnerZoomPass, acceptedLegal]);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.availabilitySlotOptions) && d.availabilitySlotOptions.length > 0) {
          setAvailabilityOptions(d.availabilitySlotOptions);
        }
      })
      .catch(() => {
        // 取得失敗時はデフォルト選択肢を使う。
      });
  }, []);

  function toggleSlot(slotId: string) {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId],
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSentMessage(null);
    if (!acceptedLegal) {
      setError("利用規約およびプライバシーポリシーに同意してください。");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const displayName = String(fd.get("displayName") ?? "").trim();
    const selectedRole = String(fd.get("role") ?? role) as "PARTNER" | "CLIENT";
    const availabilitySlotIds = selectedRole === "CLIENT" ? selectedSlotIds : [];
    if (selectedRole === "CLIENT" && availabilitySlotIds.length === 0) {
      setError("対応可能時間を1つ以上選択してください。");
      return;
    }
    const zoomUrl = partnerZoomUrl.trim();
    const zoomMeetingId = partnerZoomMeetingId.trim();
    const zoomPass = partnerZoomPass.trim();
    if (selectedRole === "PARTNER") {
      try {
        // eslint-disable-next-line no-new
        new URL(zoomUrl);
      } catch {
        setError("Zoom の会議URLを https:// から始まる正しい形式で入力してください。");
        return;
      }
      if (zoomMeetingId.length < 1) {
        setError("Zoom のミーティング ID を入力してください。");
        return;
      }
      if (zoomPass.length < 1) {
        setError("Zoom のパスコードを入力してください。");
        return;
      }
    }
    setLoading(true);
    const res = await fetch("/api/auth/register-email-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        displayName,
        role: selectedRole,
        acceptedLegal: true as const,
        availabilitySlotIds,
        zoomUrl: selectedRole === "PARTNER" ? zoomUrl : undefined,
        zoomMeetingId: selectedRole === "PARTNER" ? zoomMeetingId : undefined,
        zoomPass: selectedRole === "PARTNER" ? zoomPass : undefined,
      }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "登録メールの送信に失敗しました。");
      return;
    }
    setSentMessage(
      `${email} にパスワード設定リンクを送信しました。メール内のリンクからパスワードを設定すると登録が完了し、ログイン画面に進めます（リンクの有効期限は24時間です）。`,
    );
  }

  return (
    <AuthShell
      title="新規登録"
      subtitle="Google SSO、またはメールアドレスを登録すると確認メールからパスワード設定できます。"
    >
      <fieldset className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <legend className="px-1 text-sm font-semibold text-slate-900">利用ロール（Google/メール登録 共通）</legend>
        <p className="text-xs text-slate-600">
          先にこのロールを選んでください。Google登録でもメールアドレス登録でも同じロールで作成されます。
        </p>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
          <input
            type="radio"
            name="role"
            value="PARTNER"
            checked={role === "PARTNER"}
            onChange={() => setRole("PARTNER")}
            className="accent-zinc-900"
          />{" "}
          パートナー
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
          <input
            type="radio"
            name="role"
            value="CLIENT"
            checked={role === "CLIENT"}
            onChange={() => setRole("CLIENT")}
            className="accent-zinc-900"
          />{" "}
          クライアント
        </label>
      </fieldset>
      {role === "CLIENT" ? (
        <fieldset className="mt-4 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-4">
          <legend className="px-1 text-base font-semibold text-emerald-900">対応可能時間（複数選択）</legend>
          <p className="text-sm leading-relaxed text-emerald-900/85">{AVAILABILITY_NOTICE}</p>
          <div className="space-y-2">
            {availabilityOptions.map((opt) => (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center gap-3 rounded-md bg-white/70 px-3 py-2 text-base text-emerald-950 hover:bg-white"
              >
                <input
                  type="checkbox"
                  checked={selectedSlotIds.includes(opt.id)}
                  onChange={() => toggleSlot(opt.id)}
                  className="h-4 w-4 accent-emerald-700"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {selectedSlotIds.length === 0 ? (
            <p className="text-sm text-amber-800">少なくとも1つ選択してください。</p>
          ) : (
            <p className="text-sm text-emerald-800">{selectedSlotIds.length} 件 選択中</p>
          )}
        </fieldset>
      ) : null}
      {role === "PARTNER" ? (
        <fieldset className="mt-4 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-4">
          <legend className="px-1 text-base font-semibold text-indigo-950">Zoom 会議（必須）</legend>
          <p className="text-sm leading-relaxed text-indigo-900/85">
            登録後も「会議リンク設定」から変更できます。
          </p>
          <label className="block space-y-1 text-sm font-medium text-indigo-950">
            会議URL
            <input
              value={partnerZoomUrl}
              onChange={(e) => setPartnerZoomUrl(e.target.value)}
              type="url"
              required
              placeholder="https://zoom.us/j/..."
              className={authFieldClass}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium text-indigo-950">
            ミーティング ID
            <input
              value={partnerZoomMeetingId}
              onChange={(e) => setPartnerZoomMeetingId(e.target.value)}
              type="text"
              required
              maxLength={60}
              inputMode="numeric"
              autoComplete="off"
              placeholder="例: 123 4567 8901"
              className={authFieldClass}
            />
          </label>
          <label className="block space-y-1 text-sm font-medium text-indigo-950">
            パスコード
            <input
              value={partnerZoomPass}
              onChange={(e) => setPartnerZoomPass(e.target.value)}
              type="text"
              required
              maxLength={120}
              autoComplete="off"
              placeholder="例: 123456"
              className={authFieldClass}
            />
          </label>
        </fieldset>
      ) : null}
      <fieldset className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-800">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={acceptedLegal}
            onChange={(e) => setAcceptedLegal(e.target.checked)}
            className="mt-1 h-4 w-4 accent-indigo-700"
          />
          <span className="leading-relaxed">
            <Link href="/legal/terms" className="font-semibold text-indigo-800 underline" target="_blank" rel="noopener noreferrer">
              利用規約
            </Link>
            および
            <Link href="/legal/privacy" className="font-semibold text-indigo-800 underline" target="_blank" rel="noopener noreferrer">
              プライバシーポリシー
            </Link>
            の内容を確認し、同意します。
          </span>
        </label>
      </fieldset>
      <Link
        href={googleHref}
        onClick={(e) => {
          if (!acceptedLegal) {
            e.preventDefault();
            setError("利用規約およびプライバシーポリシーに同意してください。");
            return;
          }
          if (role !== "PARTNER") return;
          try {
            // eslint-disable-next-line no-new
            new URL(partnerZoomUrl.trim());
          } catch {
            e.preventDefault();
            setError("Google で登録する前に、有効な Zoom 会議URLを入力してください。");
            return;
          }
          if (partnerZoomMeetingId.trim().length < 1) {
            e.preventDefault();
            setError("Zoom のミーティング ID を入力してください。");
            return;
          }
          if (partnerZoomPass.trim().length < 1) {
            e.preventDefault();
            setError("Zoom のパスコードを入力してください。");
          }
        }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-xs no-underline transition hover:bg-slate-50"
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
        Google で登録・ログイン
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
        <input type="hidden" name="role" value={role} readOnly />
        <label className="block space-y-2 text-sm font-medium text-zinc-900">
          表示名（相手にもこの名前のみ表示されます）
          <input
            name="displayName"
            required
            maxLength={80}
            className={authFieldClass}
            placeholder="山田 太郎"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-zinc-900">
          メールアドレス（ログインのみに使用／相手には非表示）
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={authFieldClass}
          />
        </label>
        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        {sentMessage ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
            {sentMessage}
          </p>
        ) : null}
        <AuthPrimaryButton disabled={loading}>
          {loading ? "送信中…" : "確認メールを送信"}
        </AuthPrimaryButton>
        <p className="text-xs leading-relaxed text-slate-500">
          入力したメールアドレス宛に確認メールを送信します。メールに記載のリンクからパスワードを設定すると登録が完了します（リンクの有効期限は24時間）。
        </p>
      </form>
      <p className="mt-10 border-t border-zinc-100 pt-8 text-center text-sm text-zinc-600">
        すでにアカウントがある方は{" "}
        <AuthNavLink href="/login" className="inline-block">
          ログイン
        </AuthNavLink>
      </p>
    </AuthShell>
  );
}
