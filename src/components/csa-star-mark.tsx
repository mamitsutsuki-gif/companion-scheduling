export const CSA_STAR_REGISTRY_HREF =
  "https://cloudsecurityalliance.org/star/registry/motivage-company-limited";

/** 公式ロゴ取得前の仮表示。後から <img> に差し替え可能 */
export function CsaStarMarkPlaceholder({ size = "md" }: { size?: "sm" | "md" }) {
  const boxClass =
    size === "md" ? "h-28 w-full sm:h-32" : "h-16 w-full";

  return (
    <div
      className={`${boxClass} flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-center`}
      aria-label="CSA STAR Level 1 Self-Assessment（仮表示）"
    >
      <span className="text-base font-bold tracking-[0.2em] text-slate-800 sm:text-lg">STAR</span>
      <span className="mt-0.5 text-[10px] font-semibold tracking-[0.25em] text-slate-600 sm:text-xs">
        LEVEL ONE
      </span>
      <span className="mt-1 text-[9px] font-medium uppercase tracking-wide text-slate-500 sm:text-[10px]">
        Self-Assessment
      </span>
    </div>
  );
}
