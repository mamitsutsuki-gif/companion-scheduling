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
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [invoiceBadge, setInvoiceBadge] = useState<number>(0);
  const [memberUnreadBadge, setMemberUnreadBadge] = useState<number>(0);

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

  // メンバー向け通知（PARTNER / CLIENT / CLIENT_ADMIN）の未読バッジ
  useEffect(() => {
    if (
      profile.role !== "PARTNER" &&
      profile.role !== "CLIENT" &&
      profile.role !== "CLIENT_ADMIN"
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

  type NavLink = { href: string; label: string; badge?: number };

  const nav: NavLink[] = [{ href: "/dashboard", label: "ホーム" }];
  // メンバー（パートナー / クライアント / クライアント管理者）はホーム横にグローバル「通知」タブを置く
  if (
    profile.role === "PARTNER" ||
    profile.role === "CLIENT" ||
    profile.role === "CLIENT_ADMIN"
  ) {
    nav.push({ href: "/notifications", label: "通知", badge: memberUnreadBadge });
  }
  if (profile.role === "ADMIN") {
    nav.push({ href: "/admin/matches", label: "マッチ管理" });
    nav.push({ href: "/admin/sessions", label: "1on1日程一覧" });
    nav.push({ href: "/admin/companies", label: "企業" });
    nav.push({ href: "/admin/invoices", label: "請求書" });
    nav.push({ href: "/admin/reports", label: "レポート作成" });
    nav.push({ href: "/admin/notifications", label: "通知" });
    nav.push({ href: "/admin/settings", label: "アプリ設定" });
  }
  if (profile.role === "CLIENT_ADMIN") {
    nav.push({ href: "/client-admin/sessions", label: "1on1セッション一覧" });
  }
  if (profile.role === "PARTNER") {
    nav.push({ href: "/partner/invoices", label: "請求書", badge: invoiceBadge });
    nav.push({ href: "/partner/zoom", label: "会議リンク設定" });
  }
  if (profile.role === "PARTNER" || profile.role === "CLIENT" || profile.role === "CLIENT_ADMIN") {
    nav.push({ href: "/fta", label: "自分FTA" });
  }

  function itemClass(href: string) {
    const deep =
      href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname === href || pathname.startsWith(`${href}/`);
    return [
      "whitespace-nowrap rounded-lg px-3 py-2 text-base font-medium no-underline transition",
      deep
        ? "bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200/70"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    ].join(" ");
  }

  const roleLabel =
    profile.role === "ADMIN"
      ? "管理者"
      : profile.role === "PARTNER"
        ? "パートナー"
        : profile.role === "CLIENT_ADMIN"
          ? "クライアント管理者"
          : "クライアント";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100/55 via-slate-50 to-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/85 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:h-[3.65rem] sm:flex-nowrap sm:gap-8 sm:px-6 sm:py-0 lg:gap-12">
          <Link
            href="/dashboard"
            className="order-1 flex shrink-0 items-center gap-2 no-underline sm:order-none"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-900 text-[15px] font-bold text-white shadow-md ring-1 ring-indigo-500/35 sm:h-10 sm:w-10"
            >
              M
            </span>
            <span className="text-base leading-snug font-semibold tracking-tight text-slate-900 sm:text-base">
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
                  <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white shadow-sm">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="order-2 mr-0 ml-auto flex shrink-0 items-center gap-2 sm:order-none sm:gap-3 md:gap-5">
            <div className="hidden text-end sm:block">
              <div className="max-w-[12rem] truncate text-sm font-medium text-slate-900 sm:text-base">{withHonorificSan(profile.displayName)}</div>
              <div className="text-xs text-slate-500 sm:text-sm">{roleLabel}</div>
            </div>
            <SignOut variant="compact" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-3 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
