export const CSA_STAR_REGISTRY_HREF =
  "https://cloudsecurityalliance.org/star/registry/motivage-company-limited";

/** 公式ロゴ取得前の仮表示。後から <img> に差し替え可能 */
export function CsaStarMarkPlaceholder({ size = "md" }: { size?: "xs" | "sm" | "md" }) {
  const boxClass =
    size === "md"
      ? "h-28 w-full sm:h-32"
      : size === "sm"
        ? "h-16 w-24"
        : "h-11 w-[4.5rem]";

  const titleClass =
    size === "md" ? "text-base sm:text-lg" : size === "sm" ? "text-xs" : "text-[10px]";

  return (
    <div
      className={`${boxClass} flex flex-col items-center justify-center rounded border border-slate-200 bg-white px-1.5 text-center`}
      aria-label="CSA STAR Level 1 Self-Assessment（仮表示）"
    >
      <span className={`font-bold tracking-[0.15em] text-slate-800 ${titleClass}`}>STAR</span>
      {size !== "xs" ? (
        <>
          <span className="mt-0.5 text-[10px] font-semibold tracking-[0.2em] text-slate-600 sm:text-xs">
            LEVEL ONE
          </span>
          <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500 sm:text-[10px]">
            Self-Assessment
          </span>
        </>
      ) : (
        <span className="text-[8px] font-semibold leading-tight tracking-wide text-slate-600">
          L1
        </span>
      )}
    </div>
  );
}
