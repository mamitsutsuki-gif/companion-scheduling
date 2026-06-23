"use client";

import { useCallback, useEffect, useState } from "react";
import type { OneOnOneFormatDoc } from "@/lib/coaching-one-on-one-format";

export function CoachingOneOnOneFormatPanel({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<OneOnOneFormatDoc | null>(null);
  const [notes, setNotes] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/one-on-one-format`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.doc) {
      setDoc(json.doc);
      setNotes(json.doc.notes ?? "");
      setCanEdit(Boolean(json.permissions?.canEditClient || json.permissions?.canEditPartner));
    }
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveNotes() {
    setSaving(true);
    setNotice(null);
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/coaching/one-on-one-format`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (res.ok) {
      setDoc(json.doc);
      setNotice("保存しました。");
    }
  }

  if (loading) return <p className="text-sm text-slate-500">読込中…</p>;

  const hasConfiguredFields = Boolean(doc && doc.fields.length > 0);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">1on1フォーマット</h2>
      </div>

      {!hasConfiguredFields ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-700">
          研修が進んだ段階で表示されます。少々お待ちください。
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          {doc!.fields.map((f) => (
            <label key={f.id} className="block text-sm">
              <span className="font-medium text-slate-800">{f.label}</span>
              {f.type === "textarea" ? (
                <textarea
                  value={f.value}
                  readOnly
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
                />
              ) : (
                <input
                  value={f.value}
                  readOnly
                  className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
                />
              )}
            </label>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-800">型についてのメモ</span>
          <p className="mt-1 text-xs text-slate-600">
            1on1の型について、自分なりの注意点やアレンジをメモする欄です。
          </p>
          <textarea
            value={notes}
            disabled={!canEdit}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="例：傾聴のときは相手の言葉を要約してから質問する、など"
          />
        </label>
        {canEdit ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveNotes()}
            className="mt-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "メモを保存"}
          </button>
        ) : null}
        {notice ? <p className="mt-2 text-sm text-emerald-700">{notice}</p> : null}
      </div>
    </section>
  );
}
