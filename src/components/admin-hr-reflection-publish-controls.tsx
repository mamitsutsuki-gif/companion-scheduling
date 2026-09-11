"use client";

import { useCallback, useEffect, useState } from "react";

type ViewerRole = "ADMIN" | "ADMIN_ASSISTANT" | string;

/**
 * 管理者向け：人事にクライアント振り返りを公開／取り消しする共通 UI。
 * コーチング（ロールプレイ）・個別伴走（通常フィードバック）の両方で同じ API を使う。
 */
export function AdminHrReflectionPublishControls({
  matchId,
  sessionNumber,
  viewerRole,
  clientSubmitted,
  description,
}: {
  matchId: string;
  sessionNumber: number;
  viewerRole: ViewerRole;
  clientSubmitted: boolean;
  /** プランごとの説明文 */
  description: string;
}) {
  const canWrite = viewerRole === "ADMIN";
  const canView = viewerRole === "ADMIN" || viewerRole === "ADMIN_ASSISTANT";
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/matches/${encodeURIComponent(matchId)}/sessions/${sessionNumber}/hr-publish`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "公開状態の取得に失敗しました。");
        return;
      }
      setPublished(Boolean(json?.published));
      setPublishedAt(typeof json?.publishedAt === "string" ? json.publishedAt : null);
      setCanPublish(Boolean(json?.canPublish));
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [canView, matchId, sessionNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish() {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/admin/matches/${encodeURIComponent(matchId)}/sessions/${sessionNumber}/hr-publish`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "公開に失敗しました。");
        return;
      }
      setPublished(true);
      setPublishedAt(typeof json?.publishedAt === "string" ? json.publishedAt : new Date().toISOString());
      setCanPublish(true);
      setNotice("人事向けに公開しました。");
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/admin/matches/${encodeURIComponent(matchId)}/sessions/${sessionNumber}/hr-publish`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof json?.error === "string" ? json.error : "公開取り消しに失敗しました。");
        return;
      }
      setPublished(false);
      setPublishedAt(null);
      setNotice("人事向け公開を取り消しました。");
      await load();
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-5">
      <h3 className="text-lg font-semibold text-amber-950">人事向け振り返り公開（管理者）</h3>
      <p className="mt-2 text-sm leading-relaxed text-amber-950/90">{description}</p>
      {loading ? (
        <p className="mt-3 text-sm text-slate-600">公開状態を確認中…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-800">
            状態:{" "}
            <span className="font-semibold">
              {published
                ? `公開中${publishedAt ? `（${new Date(publishedAt).toLocaleString("ja-JP")}）` : ""}`
                : "未公開"}
            </span>
          </p>
          {!canPublish && !published ? (
            <p className="text-sm text-amber-900">
              {clientSubmitted
                ? "クライアント振り返りの必須項目が未完了のため、まだ公開できません。"
                : "クライアントが振り返りを提出すると公開できます。"}
            </p>
          ) : null}
          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              {!published ? (
                <button
                  type="button"
                  disabled={busy || !canPublish}
                  onClick={() => void publish()}
                  className="rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "処理中…" : "人事に公開する"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void unpublish()}
                  className="rounded-lg border border-amber-700 bg-white px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
                >
                  {busy ? "処理中…" : "公開を取り消す"}
                </button>
              )}
              {notice ? <span className="text-sm text-emerald-800">{notice}</span> : null}
              {error ? <span className="text-sm text-rose-700">{error}</span> : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600">閲覧のみ（公開操作は管理者のみ）</p>
          )}
        </div>
      )}
    </section>
  );
}
