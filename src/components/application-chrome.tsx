"use client";

import { APP_DISPLAY_NAME } from "@/lib/brand";
import { SignOut } from "@/components/sign-out";
import type { Role } from "@prisma/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Profile = {
  displayName: string;
  role: Role;
};

function withHonorificSan(name: string) {
  return `${name}さん`;
}

export function ApplicationChrome({
  profile,
  showFtaNav = false,
  children,
}: {
  profile: Profile;
  showFtaNav?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [invoiceBadge, setInvoiceBadge] = useState<number>(0);
  const [memberUnreadBadge, setMemberUnreadBadge] = useState<number>(0);
  const [adminUnreadBadge, setAdminUnreadBadge] = useState<number>(0);

  useEffect(() => {
    if (profile.role !== "PARTNER") return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/me/invoice-alerts", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as { count?: number } | null;
        if (!cancelled) setInvoiceBadge(json?.count ?? 0);
      } catch {
        /* ignore */
      }
    }
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [profile.role]);

  // メンバー向け通知（PARTNER / CLIENT / CLIENT_ADMIN / CLIENT_HR）の未読バッジ
  useEffect(() => {
    if (
      profile.role !== "PARTNER" &&
      profile.role !== "CLIENT" &&
      profile.role !== "CLIENT_ADMIN" &&
      profile.role !== "CLIENT_HR"
    ) {
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/me/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as { unreadCount?: number } | null;
        if (!cancelled) setMemberUnreadBadge(json?.unreadCount ?? 0);
      } catch {
        /* ignore */
      }
    }
    void load();
    const id = window.setInterval(load, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [profile.role]);

  // 管理者向け通知（ADMIN / ADMIN_ASSISTANT）の未読バッジ
  useEffect(() => {
    if (profile.role !== "ADMIN" && profile.role !== "ADMIN_ASSISTANT") return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as { unreadCount?: number } | null;
        if (!cancelled) setAdminUnreadBadge(json?.unreadCount ?? 0);
      } catch {
        /* ignore */
      }
    }
    void load();
    const id = window.setInterval(load, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [profile.role]);

  type NavLink = { href: string; label: string; badge?: number };

  const nav: NavLink[] = [{ href: "/dashboard", label: "ホーム" }];
  // メンバー（パートナー / クライアント / クライアント管理者 / クライアント人事）はホーム横にグローバル「通知」タブを置く
  if (
    profile.role === "PARTNER" ||
    profile.role === "CLIENT" ||
    profile.role === "CLIENT_ADMIN" ||
    profile.role === "CLIENT_HR"
  ) {
    nav.push({ href: "/notifications", label: "通知", badge: memberUnreadBadge });
  }
  if (profile.role === "ADMIN" || profile.role === "ADMIN_ASSISTANT") {
    // 並び順: ホーム → 通知 → 企業 → マッチ管理 → 1on1日程一覧 → レポート作成 → 請求書 → アプリ設定
    nav.push({ href: "/admin/notifications", label: "通知", badge: adminUnreadBadge });
    nav.push({ href: "/admin/companies", label: "企業" });
    nav.push({ href: "/admin/matches", label: "マッチ管理" });
    nav.push({ href: "/admin/sessions", label: "1on1日程一覧" });
    nav.push({ href: "/admin/reports", label: "レポート作成" });
    nav.push({ href: "/admin/invoices", label: "請求書" });
    nav.push({ href: "/admin/settings", label: "アプリ設定" });
  }
  if (profile.role === "CLIENT_ADMIN" || profile.role === "CLIENT_HR") {
    nav.push({ href: "/client-admin/sessions", label: "1on1セッション一覧" });
    nav.push({ href: "/client-admin/skill-check", label: "スキルチェック" });
  }
  if (profile.role === "PARTNER") {
    nav.push({ href: "/partner/invoices", label: "請求書", badge: invoiceBadge });
    nav.push({ href: "/partner/zoom", label: "会議リンク設定" });
  }
  if (showFtaNav) {
    nav.push({ href: "/fta", label: "自分FTA" });
  }

  function itemClass(href: string) {
    const deep =
      href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname === href || pathname.startsWith(`${href}/`);
    /*
     * Variant A 採用: アクティブなナビは indigo-50 / indigo-900 の二色のみ。
     * 以前の ring-1 ring-indigo-200 はノイズだったので外す。文字は太く tight。
     */
    return [
      "whitespace-nowrap rounded-lg px-3 py-2 text-[15px] font-medium no-underline transition",
      deep
        ? "bg-indigo-50 text-indigo-900"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    ].join(" ");
  }

  const roleLabel =
    profile.role === "ADMIN"
      ? "管理者"
      : profile.role === "ADMIN_ASSISTANT"
        ? "管理者アシスタント"
        : profile.role === "PARTNER"
          ? "パートナー"
          : profile.role === "CLIENT_ADMIN"
            ? "クライアント管理者"
            : profile.role === "CLIENT_HR"
              ? "クライアント人事"
              : "クライアント";

  return (
    /*
     * Variant A: 背景は flat slate-50。以前の radial-gradient + indigo-100 はリッチに見せようとして
     * 逆にチープ感（壁紙感）が出ていたため撤廃し、サーフェスはカード側で表現する。
     */
    <div className="min-h-screen">
      <header className="app-shell-header sticky top-0 z-50 backdrop-blur-md supports-[backdrop-filter]:bg-white/78">
        <div className="mx-auto flex max-w-[min(90rem,calc(100vw-1.5rem))] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:h-14 sm:flex-nowrap sm:gap-8 sm:px-6 sm:py-0 lg:gap-12">
          <Link
            href="/dashboard"
            className="order-1 flex shrink-0 items-center gap-2 no-underline sm:order-none"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-700 text-[15px] font-bold text-white shadow-md shadow-indigo-900/25 ring-1 ring-indigo-600/35 sm:h-9 sm:w-9"
            >
              M
            </span>
            <span className="text-base leading-snug font-semibold tracking-tight text-slate-900">
              {APP_DISPLAY_NAME}
            </span>
          </Link>

          <nav
            aria-label="メインメニュー"
            className="order-3 -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-0.5 overflow-x-auto px-3 pb-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-initial sm:px-0 sm:pb-0 lg:gap-1"
          >
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={itemClass(item.href)}>
                {item.label}
                {item.badge && item.badge > 0 ? (
                  <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="order-2 mr-0 ml-auto flex shrink-0 items-center gap-2 sm:order-none sm:gap-3 md:gap-4">
            <Link
              href="/account"
              className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-800 no-underline hover:bg-indigo-50 sm:hidden"
            >
              アカウント
            </Link>
            {/* Variant A: ユーザーピルは右上に控えめな丸ボーダーで配置。文字下線は外して情報密度を下げる。 */}
            <Link
              href="/account"
              className="hidden rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-end no-underline transition hover:border-indigo-200 hover:bg-indigo-50/40 sm:flex sm:items-center sm:gap-2"
              title="マイアカウント"
            >
              <span className="max-w-[10rem] truncate text-sm font-medium text-slate-900">
                {withHonorificSan(profile.displayName)}
              </span>
              <span className="hidden text-[11px] font-medium text-slate-500 lg:inline">
                {roleLabel}
              </span>
            </Link>
            <SignOut variant="compact" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[min(90rem,calc(100vw-1.5rem))] px-3 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
