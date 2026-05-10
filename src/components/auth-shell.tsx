import { APP_DISPLAY_NAME } from "@/lib/brand";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared layout so labels and links stay readable (no teal-on-teal surprises).
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
    <div className="min-h-full bg-slate-100 py-12 px-4">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200/90 bg-white px-8 py-10 shadow-md shadow-slate-200/60">
        <div className="mb-10 flex justify-center border-b border-slate-100 pb-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-slate-900 no-underline"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-900 text-base font-bold text-white shadow-md ring-1 ring-indigo-500/30"
            >
              M
            </span>
            {APP_DISPLAY_NAME}
          </Link>
        </div>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          {subtitle ? <p className="mt-3 text-sm leading-relaxed text-slate-600">{subtitle}</p> : null}
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
      className="w-full rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-55"
    >
      {children}
    </button>
  );
}

export const authFieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 caret-slate-950 shadow-xs placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";
