"use client";

type Props = {
  variant?: "default" | "compact";
};

export function SignOut({ variant = "default" }: Props) {
  const compact = variant === "compact";
  return (
    <button
      type="button"
      className={
        compact
          ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-xs hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-400/40 focus-visible:outline-none sm:text-[13px] sm:normal-case sm:tracking-normal"
          : "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
      }
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      ログアウト
    </button>
  );
}
