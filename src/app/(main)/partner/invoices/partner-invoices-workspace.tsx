"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type InvoiceStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "CONFIRMED";

type InvoiceItem = {
  matchId: string;
  sessionNumber: number;
  sessionDate: string;
  clientName: string;
  unitPriceExclTax: number;
};

type InvoiceRow = {
  id: string;
  partnerId: string;
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

type BillingProfile = {
  partnerId: string;
  address: string;
  phone: string;
  bankAccount: string;
  updatedAt: string;
};

type LoadResp = {
  invoice: InvoiceRow | null;
  candidates: InvoiceItem[];
  profile: BillingProfile | null;
  partnerName: string;
  transferDate: string;
  itemsForView: InvoiceItem[];
  editable: boolean;
  unlocked: boolean;
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "下書き",
  SUBMITTED: "提出済（管理者の確認待ち）",
  RETURNED: "差し戻し（再編集してください）",
  CONFIRMED: "確定済み（お振込をお待ちください）",
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

function formatJpy(yen: number) {
  return `¥${(yen || 0).toLocaleString("ja-JP")}`;
}

const CURRENT_DATE = new Date();
const DEFAULT_YEAR = CURRENT_DATE.getFullYear();
const DEFAULT_MONTH = CURRENT_DATE.getMonth() + 1;

export function PartnerInvoicesWorkspace() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<LoadResp | null>(null);

  // フォームのローカル状態（自動反映後もユーザーが上書き編集できる）
  const [partnerName, setPartnerName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/partner/invoices?year=${year}&month=${month}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as LoadResp | { error?: string } | null;
    setLoading(false);
    if (!res.ok || !json) {
      setError((json && "error" in json && json.error) || "取得に失敗しました。");
      return;
    }
    const d = json as LoadResp;
    setData(d);
    const inv = d.invoice;
    setPartnerName(inv?.partnerName?.trim() || d.partnerName || "");
    setAddress(inv?.address?.trim() || d.profile?.address || "");
    setPhone(inv?.phone?.trim() || d.profile?.phone || "");
    setBankAccount(inv?.bankAccount?.trim() || d.profile?.bankAccount || "");
    setItems(d.itemsForView ?? []);
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + (Number.isFinite(it.unitPriceExclTax) ? it.unitPriceExclTax : 0), 0),
    [items],
  );

  const isLocked = data?.invoice?.status === "SUBMITTED" || data?.invoice?.status === "CONFIRMED";
  const isMonthEditable = data?.editable ?? true;
  // 編集可: 月の範囲内 かつ 状態的にロックされていない
  const canEditFields = isMonthEditable && !isLocked;

  async function onSaveDraft() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/partner/invoices`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        month,
        partnerName: partnerName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        bankAccount: bankAccount.trim(),
        items: items.map((it) => ({
          ...it,
          unitPriceExclTax: Math.max(0, Math.round(Number(it.unitPriceExclTax) || 0)),
          clientName: it.clientName.trim(),
        })),
      }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "保存に失敗しました。");
      return;
    }
    setNotice("下書きを保存しました。");
    void load();
    // プロフィール（住所等）も最新化のため保存
    void fetch(`/api/partner/billing-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address.trim(),
        phone: phone.trim(),
        bankAccount: bankAccount.trim(),
      }),
    });
  }

  async function onSubmit() {
    if (!data) return;
    if (!window.confirm("内容を提出します。提出後は差し戻されるまで編集できません。よろしいですか？")) {
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    // まず下書き保存してから submit
    const putRes = await fetch(`/api/partner/invoices`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        month,
        partnerName: partnerName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        bankAccount: bankAccount.trim(),
        items: items.map((it) => ({
          ...it,
          unitPriceExclTax: Math.max(0, Math.round(Number(it.unitPriceExclTax) || 0)),
          clientName: it.clientName.trim(),
        })),
      }),
    });
    if (!putRes.ok) {
      const j = await putRes.json().catch(() => null);
      setError(j?.error ?? "保存に失敗しました。");
      setSaving(false);
      return;
    }
    const res = await fetch(`/api/partner/invoices/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month }),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "提出に失敗しました。");
      return;
    }
    setNotice("請求書を提出しました。管理者の確認をお待ちください。");
    void load();
    void fetch(`/api/partner/billing-profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: address.trim(),
        phone: phone.trim(),
        bankAccount: bankAccount.trim(),
      }),
    });
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateItem(idx: number, patch: Partial<InvoiceItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  /**
   * 「この請求書だけ」をPDF/印刷する。
   * body に `print-invoice-only` を付けると CSS 側が
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
    // Safari など afterprint が発火しない環境向けの保険
    setTimeout(cleanup, 2000);
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => DEFAULT_YEAR - 1 + i);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-3 py-5 sm:px-6 sm:py-8">
      <header className="space-y-2 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Partner</p>
        <h1 className="text-2xl font-semibold text-slate-900">請求書</h1>
        <p className="text-sm text-slate-600">
          対象月を選ぶと、その月に実施した（パートナーレポート入力済の）セッションが請求明細として表示されます。自動反映された行は編集可能です。
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
          {data?.invoice ? (
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-semibold ${STATUS_TONE[data.invoice.status]}`}
            >
              {STATUS_LABEL[data.invoice.status]}
            </span>
          ) : null}
        </div>
      </section>

      {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900">{notice}</p> : null}

      {data?.invoice?.status === "RETURNED" && data.invoice.adminComment ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm sm:p-6">
          <p className="font-semibold">差し戻しコメント</p>
          <p className="mt-1 whitespace-pre-wrap">{data.invoice.adminComment}</p>
        </section>
      ) : null}

      {loading ? (
        <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">読込中…</p>
      ) : null}

      {data ? (
        <section className="invoice-print-target space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <p className="text-sm text-slate-600">
              {data.invoice?.status === "CONFIRMED"
                ? "確定済みです。下の「PDFダウンロード」ボタンから保存できます（ブラウザの印刷画面で「PDFとして保存」を選択）。"
                : data.invoice?.status === "SUBMITTED"
                  ? "提出済みです。管理者の確認をお待ちください。提出済みの内容もPDFで保存できます。"
                  : "「PDFダウンロード」で印刷画面が開きます。「PDFとして保存」を選択すると PDF として保存できます。"}
            </p>
            <button
              type="button"
              onClick={onPrintInvoiceOnly}
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800"
            >
              🧾 PDFダウンロード
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">請求元（パートナー）</h2>
              <div className="mt-2 space-y-2">
                <label className="block text-sm font-medium text-slate-800">
                  パートナー名
                  <input
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    disabled={!canEditFields}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base disabled:bg-slate-50"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  住所
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={!canEditFields}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base disabled:bg-slate-50"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  電話番号
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!canEditFields}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base disabled:bg-slate-50"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  振込先口座
                  <textarea
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    disabled={!canEditFields}
                    rows={3}
                    placeholder="例: ◯◯銀行 ◯◯支店 普通 1234567 名義: ヤマダ タロウ"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base disabled:bg-slate-50"
                  />
                </label>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-slate-900">請求書の宛先</h2>
              <p className="mt-2 whitespace-pre-line rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {"株式会社モチベイジ\n代表取締役　筒木麻未\n〒103-0006\n東京都中央区日本橋富沢町9-4"}
              </p>

              <h2 className="mt-4 text-base font-semibold text-slate-900">対象月 / 日付</h2>
              <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
                <dt className="text-slate-500">請求月</dt>
                <dd className="text-slate-900">{year}年 {month}月</dd>
                <dt className="text-slate-500">提出日</dt>
                <dd className="text-slate-900">
                  {data.invoice?.submittedAt ? formatDate(data.invoice.submittedAt) : "提出時に自動入力"}
                </dd>
                <dt className="text-slate-500">振込日</dt>
                <dd className="text-slate-900">{formatDate(data.transferDate)}（編集不可）</dd>
              </dl>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-slate-900">請求明細</h2>
            <p className="mt-1 text-xs text-slate-500">
              「パートナーレポートが入力済」のセッションのみ自動反映されます。税抜単価はご自身で入力してください。
            </p>
            {items.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                対象月に実施済（レポート入力済み）のセッションはありません。
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">実施日</th>
                      <th className="px-2 py-2">クライアント</th>
                      <th className="px-2 py-2">セッション</th>
                      <th className="px-2 py-2 text-right">税抜単価</th>
                      {canEditFields ? <th className="px-2 py-2 print:hidden"></th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {items.map((it, i) => (
                      <tr key={`${it.matchId}-${it.sessionNumber}-${i}`}>
                        <td className="px-2 py-2 align-top">
                          {!canEditFields ? (
                            formatDate(it.sessionDate)
                          ) : (
                            <input
                              type="date"
                              value={it.sessionDate ? it.sessionDate.slice(0, 10) : ""}
                              onChange={(e) =>
                                updateItem(i, {
                                  sessionDate: e.target.value
                                    ? new Date(e.target.value).toISOString()
                                    : "",
                                })
                              }
                              className="w-36 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {!canEditFields ? (
                            it.clientName
                          ) : (
                            <input
                              value={it.clientName}
                              onChange={(e) => updateItem(i, { clientName: e.target.value })}
                              className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2 align-top text-slate-600">
                          {it.sessionNumber} 回目
                        </td>
                        <td className="px-2 py-2 align-top text-right">
                          {!canEditFields ? (
                            formatJpy(it.unitPriceExclTax)
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step={100}
                              value={it.unitPriceExclTax}
                              onChange={(e) =>
                                updateItem(i, {
                                  unitPriceExclTax: Math.max(0, Math.round(Number(e.target.value) || 0)),
                                })
                              }
                              className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm"
                            />
                          )}
                        </td>
                        {canEditFields ? (
                          <td className="px-2 py-2 align-top print:hidden">
                            <button
                              type="button"
                              onClick={() => removeItem(i)}
                              className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            >
                              削除
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-2 py-2 text-right font-semibold text-slate-800">
                        合計（税抜）
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-slate-900">
                        {formatJpy(total)}
                      </td>
                      {canEditFields ? <td className="print:hidden"></td> : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 print:hidden">
            {canEditFields ? (
              <>
                <button
                  type="button"
                  onClick={() => void onSaveDraft()}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {saving ? "保存中…" : "下書きを保存"}
                </button>
                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={saving}
                  className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800 disabled:opacity-60"
                >
                  {saving ? "送信中…" : "確定・提出"}
                </button>
              </>
            ) : isLocked && data?.invoice?.status === "SUBMITTED" ? (
              <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                提出済みです。管理者の確認をお待ちください。差し戻しまたは確定の連絡があるまで編集できません。
              </p>
            ) : isLocked && data?.invoice?.status === "CONFIRMED" ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                確定しました。お振込をお待ちください。
              </p>
            ) : !isMonthEditable ? (
              <p className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                編集できる期間（当月・前月）を過ぎているため、過去分は閲覧のみとなります。例外的に編集が必要な場合は管理者にアンロックを依頼してください。
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
