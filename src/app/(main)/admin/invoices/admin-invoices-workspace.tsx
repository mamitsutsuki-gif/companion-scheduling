"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type InvoiceStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "CONFIRMED";

type InvoiceItem = {
  matchId: string;
  sessionNumber: number;
  sessionDate: string;
  clientName: string;
  clientCompanyName: string;
  unitPriceExclTax: number;
};

type InvoiceRow = {
  id: string;
  partnerId: string;
  partnerDisplayName?: string;
  year: number;
  month: number;
  status: InvoiceStatus;
  partnerName: string;
  address: string;
  phone: string;
  bankAccount: string;
  items: InvoiceItem[];
  submittedAt: string | null;
  confirmedAt: string | null;
  returnedAt: string | null;
  adminComment: string | null;
  transferDate: string;
  createdAt: string;
  updatedAt: string;
};

type MissingPreviewRow = {
  partnerId: string;
  partnerDisplayName: string;
  items: InvoiceItem[];
  transferDate: string;
};

type AdminInvoiceListResp = {
  invoices: InvoiceRow[];
  missing: MissingPreviewRow[];
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "下書き",
  SUBMITTED: "提出済（確認待ち）",
  RETURNED: "差し戻し中",
  CONFIRMED: "確定",
};
const STATUS_TONE: Record<InvoiceStatus, string> = {
  DRAFT: "border-zinc-300 bg-zinc-50 text-zinc-800",
  SUBMITTED: "border-sky-300 bg-sky-50 text-sky-800",
  RETURNED: "border-amber-300 bg-amber-50 text-amber-900",
  CONFIRMED: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

function formatDateTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatJpy(yen: number) {
  return `¥${(yen || 0).toLocaleString("ja-JP")}`;
}

const CURRENT_DATE = new Date();
const DEFAULT_YEAR = CURRENT_DATE.getFullYear();
const DEFAULT_MONTH = CURRENT_DATE.getMonth() + 1;

export function AdminInvoicesWorkspace() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [missing, setMissing] = useState<MissingPreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [selectedMissing, setSelectedMissing] = useState<MissingPreviewRow | null>(null);
  const [acting, setActing] = useState(false);
  const [returnComment, setReturnComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/invoices?year=${year}&month=${month}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as AdminInvoiceListResp | { error?: string } | null;
    setLoading(false);
    if (!res.ok || !json) {
      setError((json && "error" in json && json.error) || "取得に失敗しました。");
      setInvoices([]);
      setMissing([]);
      return;
    }
    const d = json as AdminInvoiceListResp;
    const normItems = (items: InvoiceItem[]) =>
      (items ?? []).map((it) => ({ ...it, clientCompanyName: it.clientCompanyName ?? "" }));
    setInvoices(
      (Array.isArray(d.invoices) ? d.invoices : []).map((inv) => ({
        ...inv,
        items: normItems(inv.items),
      })),
    );
    setMissing(
      (Array.isArray(d.missing) ? d.missing : []).map((m) => ({
        ...m,
        items: normItems(m.items),
      })),
    );
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // 月切り替えで選択をクリア
    setSelected(null);
    setSelectedMissing(null);
    setReturnComment("");
  }, [year, month]);

  const totalForSelected = useMemo(() => {
    if (!selected) return 0;
    return selected.items.reduce((s, it) => s + (it.unitPriceExclTax || 0), 0);
  }, [selected]);

  const totalForMissing = useMemo(() => {
    if (!selectedMissing) return 0;
    return selectedMissing.items.reduce((s, it) => s + (it.unitPriceExclTax || 0), 0);
  }, [selectedMissing]);

  async function onUnlock(partnerId: string) {
    if (
      !window.confirm(
        "このパートナーに対し、対象月の請求書編集を例外的に許可します。よろしいですか？",
      )
    ) {
      return;
    }
    setActing(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/invoices/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerId, year, month }),
    });
    const json = await res.json().catch(() => null);
    setActing(false);
    if (!res.ok) {
      setError(json?.error ?? "アンロックに失敗しました。");
      return;
    }
    setNotice("対象パートナーに編集権限を付与しました。通知済みです。");
  }

  async function refreshSelected(invoiceId: string) {
    const res = await fetch(`/api/admin/invoices/${invoiceId}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.invoice) {
      setSelected(json.invoice as InvoiceRow);
      await load();
    }
  }

  async function onConfirm() {
    if (!selected) return;
    if (!window.confirm("この請求書を確定します。よろしいですか？")) return;
    setActing(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/invoices/${selected.id}/confirm`, { method: "POST" });
    const json = await res.json().catch(() => null);
    setActing(false);
    if (!res.ok) {
      setError(json?.error ?? "確定に失敗しました。");
      return;
    }
    setNotice("確定しました。パートナーへ通知済みです。");
    await refreshSelected(selected.id);
  }

  async function onReturn() {
    if (!selected) return;
    if (!window.confirm("この請求書を差し戻します。よろしいですか？")) return;
    setActing(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/invoices/${selected.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: returnComment.trim() }),
    });
    const json = await res.json().catch(() => null);
    setActing(false);
    if (!res.ok) {
      setError(json?.error ?? "差し戻しに失敗しました。");
      return;
    }
    setNotice("差し戻しました。パートナーへ通知済みです。");
    setReturnComment("");
    await refreshSelected(selected.id);
  }

  /**
   * 確定済みの請求書を「未確定に戻して差し戻し」する。
   * バックエンド的には CONFIRMED → RETURNED に書き換える adminReturnPartnerInvoice を再利用。
   */
  async function onUnconfirmAndReturn() {
    if (!selected) return;
    if (
      !window.confirm(
        "確定済みの請求書を未確定（差し戻し中）に戻します。パートナーは再編集できるようになります。よろしいですか？",
      )
    ) {
      return;
    }
    setActing(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/invoices/${selected.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: returnComment.trim() }),
    });
    const json = await res.json().catch(() => null);
    setActing(false);
    if (!res.ok) {
      setError(json?.error ?? "確定の取り消しに失敗しました。");
      return;
    }
    setNotice("確定を取り消し、差し戻しました。パートナーへ通知済みです。");
    setReturnComment("");
    await refreshSelected(selected.id);
  }

  /**
   * 「この請求書だけ」を印刷／PDF化する。
   * body に `print-invoice-only` を付けると、CSS 側が
   * `invoice-print-target` 以外を visibility:hidden にする。
   */
  function onPrintInvoiceOnly() {
    if (typeof window === "undefined") return;
    document.body.classList.add("print-invoice-only");
    const cleanup = () => {
      document.body.classList.remove("print-invoice-only");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(cleanup, 2000);
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => DEFAULT_YEAR - 1 + i);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 py-5 sm:px-6 sm:py-8">
      <header className="space-y-2 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Administrator</p>
        <h1 className="text-2xl font-semibold text-slate-900">請求書</h1>
        <p className="text-sm text-slate-600">
          対象月を選び、提出された請求書を確認します。各請求書をクリックして開き、内容を確認のうえ「差し戻し」または「確定」を行ってください。
        </p>
      </header>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm font-medium text-slate-800">
            年
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1 w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-800">
            月
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="mt-1 w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{notice}</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">
          {year}年{month}月 の請求書一覧
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          未作成のパートナーも、レポート入力済セッションがあれば「未作成」行として表示されます。
        </p>
        {loading ? (
          <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            読込中…
          </p>
        ) : invoices.length === 0 && missing.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            この月に該当する請求書（実施済セッションを含む）はありません。
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {invoices.map((inv) => {
              const total = inv.items.reduce((s, it) => s + (it.unitPriceExclTax || 0), 0);
              const partnerLabel = inv.partnerDisplayName || inv.partnerName || inv.partnerId;
              return (
                <li key={inv.id} className="py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(inv);
                      setSelectedMissing(null);
                    }}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[inv.status]}`}
                      >
                        {STATUS_LABEL[inv.status]}
                      </span>
                      <span className="font-semibold text-slate-900">{partnerLabel}</span>
                      <span className="text-sm text-slate-500">
                        {inv.items.length}件 / 合計 {formatJpy(total)}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {inv.submittedAt ? `提出: ${formatDateTime(inv.submittedAt)}` : "未提出"}
                    </span>
                  </button>
                </li>
              );
            })}
            {missing.map((m) => {
              const total = m.items.reduce((s, it) => s + (it.unitPriceExclTax || 0), 0);
              const partnerLabel = m.partnerDisplayName || m.partnerId;
              return (
                <li key={`missing-${m.partnerId}`} className="py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMissing(m);
                      setSelected(null);
                    }}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                        未作成
                      </span>
                      <span className="font-semibold text-slate-900">{partnerLabel}</span>
                      <span className="text-sm text-slate-500">
                        実施済 {m.items.length}件 / 合計 {formatJpy(total)}（未入力）
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">パートナー未提出</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected ? (
        <section className="invoice-print-target space-y-5 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <p className="text-xs font-semibold tracking-wide text-indigo-700">請求書詳細</p>
              <h2 className="text-xl font-semibold text-slate-900">
                {selected.partnerDisplayName || selected.partnerName} ／ {selected.year}年{selected.month}月
              </h2>
              <span
                className={`mt-1 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[selected.status]}`}
              >
                {STATUS_LABEL[selected.status]}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPrintInvoiceOnly}
                className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800"
                title="ブラウザの印刷画面で「PDFとして保存」を選択してください"
              >
                🧾 PDFダウンロード
              </button>
              <button
                type="button"
                onClick={() => void onUnlock(selected.partnerId)}
                disabled={acting}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-60"
                title="このパートナーの当月分の編集を例外的に許可します"
              >
                編集アンロック
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                閉じる
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">請求元</p>
              <p>{selected.partnerName || selected.partnerDisplayName}</p>
              <p className="whitespace-pre-wrap text-slate-700">{selected.address}</p>
              {selected.phone ? <p className="text-slate-700">TEL {selected.phone}</p> : null}
              <p className="mt-2 font-semibold text-slate-800">振込先口座</p>
              <p className="whitespace-pre-wrap text-slate-700">{selected.bankAccount}</p>
            </div>
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">宛先</p>
              <p className="whitespace-pre-line text-slate-700">
                {"株式会社モチベイジ\n代表取締役　筒木麻未\n〒103-0006\n東京都中央区日本橋富沢町9-4"}
              </p>
              <p className="mt-2 font-semibold text-slate-800">日付</p>
              <p>提出日: {formatDateTime(selected.submittedAt) || "—"}</p>
              <p>振込日: {formatDate(selected.transferDate)}</p>
              {selected.confirmedAt ? <p>確定日: {formatDateTime(selected.confirmedAt)}</p> : null}
              {selected.returnedAt ? <p>差し戻し日: {formatDateTime(selected.returnedAt)}</p> : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">実施日</th>
                  <th className="px-2 py-2">企業名</th>
                  <th className="px-2 py-2">クライアント</th>
                  <th className="px-2 py-2">セッション</th>
                  <th className="px-2 py-2 text-right">税抜単価</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {selected.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                      明細はありません。
                    </td>
                  </tr>
                ) : (
                  selected.items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-2 py-2">{formatDate(it.sessionDate)}</td>
                      <td className="px-2 py-2">{(it.clientCompanyName ?? "").trim() || "—"}</td>
                      <td className="px-2 py-2">{it.clientName}</td>
                      <td className="px-2 py-2">{it.sessionNumber} 回目</td>
                      <td className="px-2 py-2 text-right">{formatJpy(it.unitPriceExclTax)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td colSpan={4} className="px-2 py-2 text-right font-semibold text-slate-800">
                    合計（税抜）
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-slate-900">
                    {formatJpy(totalForSelected)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {selected.status === "RETURNED" && selected.adminComment ? (
            <section className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">前回の差し戻しコメント</p>
              <p className="mt-1 whitespace-pre-wrap">{selected.adminComment}</p>
            </section>
          ) : null}

          {selected.status === "SUBMITTED" || selected.status === "RETURNED" ? (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <label className="block text-sm font-medium text-slate-800">
                差し戻しコメント（任意）
                <textarea
                  value={returnComment}
                  onChange={(e) => setReturnComment(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="差し戻し理由をパートナーに伝える場合に入力"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void onReturn()}
                  disabled={acting}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-60"
                >
                  {acting ? "処理中…" : "差し戻し"}
                </button>
                <button
                  type="button"
                  onClick={() => void onConfirm()}
                  disabled={acting}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
                >
                  {acting ? "処理中…" : "確定"}
                </button>
              </div>
            </div>
          ) : selected.status === "CONFIRMED" ? (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                この請求書は確定済みです。誤って確定した場合は、下のボタンから「未確定に戻して差し戻し」できます。
              </p>
              <label className="block text-sm font-medium text-slate-800">
                差し戻しコメント（任意）
                <textarea
                  value={returnComment}
                  onChange={(e) => setReturnComment(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="差し戻し理由をパートナーに伝える場合に入力"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => void onUnconfirmAndReturn()}
                disabled={acting}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 disabled:opacity-60"
              >
                {acting ? "処理中…" : "確定を取り消して差し戻す"}
              </button>
            </div>
          ) : (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              パートナーは下書きを保存中です。提出後に確定／差し戻しの操作ができるようになります。
            </p>
          )}
        </section>
      ) : null}

      {selectedMissing ? (
        <section className="invoice-print-target space-y-5 rounded-2xl border border-zinc-300 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <p className="text-xs font-semibold tracking-wide text-zinc-600">請求書プレビュー（未作成）</p>
              <h2 className="text-xl font-semibold text-slate-900">
                {selectedMissing.partnerDisplayName || selectedMissing.partnerId} ／ {year}年{month}月
              </h2>
              <span className="mt-1 inline-flex items-center rounded-md border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                未作成（パートナーが請求書を作成していません）
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onPrintInvoiceOnly}
                className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800"
                title="ブラウザの印刷画面で「PDFとして保存」を選択してください"
              >
                🧾 PDFダウンロード
              </button>
              <button
                type="button"
                onClick={() => void onUnlock(selectedMissing.partnerId)}
                disabled={acting}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-60"
                title="このパートナーの当月分の編集を例外的に許可します"
              >
                編集アンロック
              </button>
              <button
                type="button"
                onClick={() => setSelectedMissing(null)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                閉じる
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">請求元</p>
              <p>{selectedMissing.partnerDisplayName}</p>
              <p className="text-zinc-500">（住所・電話番号・振込先口座はパートナー未入力）</p>
            </div>
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">宛先</p>
              <p className="whitespace-pre-line text-slate-700">
                {"株式会社モチベイジ\n代表取締役　筒木麻未\n〒103-0006\n東京都中央区日本橋富沢町9-4"}
              </p>
              <p className="mt-2 font-semibold text-slate-800">日付</p>
              <p>請求月: {year}年{month}月</p>
              <p>振込日: {formatDate(selectedMissing.transferDate)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">実施日</th>
                  <th className="px-2 py-2">企業名</th>
                  <th className="px-2 py-2">クライアント</th>
                  <th className="px-2 py-2">セッション</th>
                  <th className="px-2 py-2 text-right">税抜単価</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {selectedMissing.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                      実施済セッションはありません。
                    </td>
                  </tr>
                ) : (
                  selectedMissing.items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-2 py-2">{formatDate(it.sessionDate)}</td>
                      <td className="px-2 py-2">{(it.clientCompanyName ?? "").trim() || "—"}</td>
                      <td className="px-2 py-2">{it.clientName}</td>
                      <td className="px-2 py-2">{it.sessionNumber} 回目</td>
                      <td className="px-2 py-2 text-right text-zinc-500">未入力</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td colSpan={4} className="px-2 py-2 text-right font-semibold text-slate-800">
                    合計（税抜）
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-slate-900">
                    {formatJpy(totalForMissing)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
