"use client";

import { APP_DISPLAY_NAME } from "@/lib/brand";
import { SignOut } from "@/components/sign-out";
import type { Role } from "@prisma/client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

  type NavLink = { href: string; label: string };

  const nav: NavLink[] = [{ href: "/dashboard", label: "ホーム" }];
  if (profile.role === "ADMIN") {
    nav.push({ href: "/admin/matches", label: "マッチ管理" });
    nav.push({ href: "/admin/settings", label: "アプリ設定" });
  }
  if (profile.role === "PARTNER") {
    nav.push({ href: "/partner/zoom", label: "会議リンク設定" });
  }
  if (profile.role === "PARTNER" || profile.role === "CLIENT") {
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
    profile.role === "ADMIN" ? "管理者" : profile.role === "PARTNER" ? "パートナー" : "クライアント";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100/55 via-slate-50 to-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/85 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
        <div className="mx-auto flex h-[3.65rem] max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 sm:flex-nowrap sm:gap-8 sm:px-6 lg:gap-12">
          <Link
            href="/dashboard"
            className="order-1 flex shrink-0 items-center gap-2 no-underline sm:order-none"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-900 text-[15px] font-bold text-white shadow-md ring-1 ring-indigo-500/35"
            >
              M
            </span>
            <span className="leading-snug font-semibold tracking-tight text-slate-900">
              {APP_DISPLAY_NAME}
            </span>
          </Link>

          <nav
            aria-label="メインメニュー"
            className="order-3 flex flex-1 items-center gap-0.5 overflow-x-auto pb-px sm:order-none sm:flex-initial sm:flex-none lg:gap-1"
          >
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={itemClass(item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="order-2 mr-0 ml-auto flex shrink-0 items-center gap-3 sm:order-none md:gap-5">
            <div className="hidden text-end sm:block">
              <div className="max-w-[12rem] truncate text-base font-medium text-slate-900">{withHonorificSan(profile.displayName)}</div>
              <div className="text-sm text-slate-500">{roleLabel}</div>
            </div>
            <SignOut variant="compact" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
