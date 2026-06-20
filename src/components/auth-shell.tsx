import { APP_DISPLAY_NAME } from "@/lib/brand";
import { MotiveIjiLogo } from "@/components/motive-iji-logo";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 未ログイン画面（ログイン / 登録 / パスワード再設定）共通のシェル。
 * Variant A の方向性に合わせて、白カード + flat indigo ロゴ + 控えめなシャドウで統一する。
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full px-4 py-12">
      <div className="app-surface-raised mx-auto w-full max-w-md rounded-2xl px-8 py-10">
        <Link href="/" className="mb-8 flex flex-col items-center gap-3 border-b border-slate-100 pb-6 no-underline">
          <MotiveIjiLogo variant="vertical" priority />
          <p className="text-sm font-semibold tracking-tight text-slate-800">{APP_DISPLAY_NAME}</p>
        </Link>
        <div className="mb-8">
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-slate-950">{title}</h1>
          {subtitle ? <p className="mt-3 text-base leading-relaxed text-slate-600">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

/** 白カード内の補助リンク（コントラスト確保済み）。 */
export function AuthNavLink({ className, ...rest }: React.ComponentProps<typeof Link>) {
  return (
    <Link
      {...rest}
      className={[
        "text-sm font-medium text-indigo-700 underline-offset-2 hover:text-indigo-900 hover:underline",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function AuthPrimaryButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="app-btn-primary w-full rounded-lg px-3 py-2.5 text-sm disabled:opacity-55"
    >
      {children}
    </button>
  );
}

export const authFieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 caret-slate-950 shadow-xs placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";
