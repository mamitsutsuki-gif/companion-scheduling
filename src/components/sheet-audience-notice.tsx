import {
  formatAudienceLine,
  SHEET_AUDIENCE,
  type SheetAudienceKey,
} from "@/lib/companion-sheet-audience";

export function SheetAudienceNotice({
  sheet,
  className = "",
  hideOnPrint = false,
}: {
  sheet: SheetAudienceKey;
  className?: string;
  /** 印刷・PDF出力時に非表示にする（総括レポート向け） */
  hideOnPrint?: boolean;
}) {
  const def = SHEET_AUDIENCE[sheet];
  const printClass = hideOnPrint ? "no-print " : "";

  return (
    <div
      className={`${printClass}rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 ${className}`.trim()}
      role="note"
      aria-label="このシートの共有範囲"
    >
      <p className="font-medium text-slate-800">このシートの共有範囲</p>
      <p className="mt-1 leading-relaxed">
        {def.lines.map((line, i) => (
          <span key={line.role}>
            {i > 0 ? " ／ " : null}
            {formatAudienceLine(line)}
          </span>
        ))}
      </p>
      {def.footnote ? <p className="mt-1 text-xs text-slate-600">{def.footnote}</p> : null}
    </div>
  );
}
