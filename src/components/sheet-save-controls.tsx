"use client";

export function SheetSaveButton({
  saving,
  disabled,
  onClick,
  label = "保存する",
}: {
  saving: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
    >
      {saving ? "保存中…" : label}
    </button>
  );
}

/** 長いシートで、スクロール中も保存できるように画面上部へ固定する */
export function SheetStickySaveBar({
  saving,
  disabled,
  onClick,
  label = "保存する",
  hint = "途中でも保存できます",
}: {
  saving: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  hint?: string;
}) {
  return (
    <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-100 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
      <SheetSaveButton saving={saving} disabled={disabled} onClick={onClick} label={label} />
      <p className="text-xs text-slate-600">{hint}</p>
    </div>
  );
}
