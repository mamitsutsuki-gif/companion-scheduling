"use client";

export function CompanionSheetPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-6">
      <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-700">{description}</p>
      <p className="text-xs font-semibold text-indigo-800">この機能は順次リリース予定です（MVP実装中）。</p>
    </section>
  );
}
