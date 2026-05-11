"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

type Pair = {
  id: string;
  createdAt: string;
  partner: { id: string; displayName: string };
  client: { id: string; displayName: string };
};

type AvailabilityOption = {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
};

type SettingsSnapshot = {
  slotDurationMinutes: number;
  totalSessions: number;
  timezone: string;
  availabilitySlotOptions: AvailabilityOption[];
  partnerExtraQuestionsByRound: Record<string, string[]>;
  sessionGuidelinesByRound: Record<string, { client: string; partner: string }>;
  slotEarliestHour: number;
  slotLatestHour: number;
  allowWeekends: boolean;
};

type EffectiveSnapshot = SettingsSnapshot & {
  overriddenFields: Array<keyof SettingsSnapshot>;
};

type ApiResponse = {
  company: { id: string; name: string } | null;
  isRegistered: boolean;
  pairs: Pair[];
  pairCount: number;
  effective: EffectiveSnapshot;
  override:
    | (Partial<SettingsSnapshot> & { updatedAt?: string })
    | null;
  global: SettingsSnapshot;
};

const FIELD_LABEL: Record<keyof SettingsSnapshot, string> = {
  slotDurationMinutes: "枠（1回の長さ・分）",
  totalSessions: "回数（総セッション数）",
  timezone: "タイムゾーン",
  availabilitySlotOptions: "対応可能時間の選択肢",
  partnerExtraQuestionsByRound: "パートナー追加質問",
  sessionGuidelinesByRound: "セッションガイドライン",
  slotEarliestHour: "候補の最早時刻",
  slotLatestHour: "候補の最遅時刻",
  allowWeekends: "土日を許可",
};

function formatJaDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = use(params);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | (ApiResponse & { error?: string })
          | null;
        if (cancelled) return;
        if (!res.ok || !json) {
          setError(json?.error ?? "取得に失敗しました。");
          setLoading(false);
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setError("ネットワークエラーが発生しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const headerTitle =
    data?.company?.name ?? (data?.isRegistered === false ? `未登録ID: ${companyId}` : companyId);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator / Company
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {headerTitle}
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">企業ID: {companyId}</p>
        {data && !data.isRegistered ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            この企業IDは「アプリ設定 → 企業（テナント）」に登録されていません。先に登録してください。
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/companies"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            ← 企業一覧へ
          </Link>
          <Link
            href={`/admin/companies/${encodeURIComponent(companyId)}/settings`}
            className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900 no-underline hover:bg-indigo-100"
          >
            企業ごとの設定を編集 →
          </Link>
          <Link
            href={`/admin/sessions?company=${encodeURIComponent(companyId)}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
          >
            この企業の1on1日程一覧
          </Link>
        </div>
      </header>

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      {loading ? <p className="text-slate-600">読込中…</p> : null}

      {data ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                ペア一覧（{data.pairCount}件）
              </h2>
            </div>
            {data.pairs.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
                この企業に所属するクライアントが含まれるペアはまだありません。
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm text-slate-800">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-3 py-2">パートナー</th>
                      <th className="px-3 py-2">クライアント</th>
                      <th className="px-3 py-2">作成日</th>
                      <th className="px-3 py-2">ルーム</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pairs.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="px-3 py-2">{p.partner.displayName}さん</td>
                        <td className="px-3 py-2">{p.client.displayName}さん</td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                          {formatJaDate(p.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/match/${p.id}`}
                            className="font-medium text-indigo-700 no-underline hover:underline"
                          >
                            開く →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                この企業に適用されている設定（実効値）
              </h2>
              <span className="text-xs text-slate-500">
                次のステップ（Step 3）で編集機能を追加予定です
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              「<span className="font-semibold text-indigo-800">企業上書き</span>
              」がある項目は企業ごとに固有の値、それ以外は「
              <span className="font-semibold text-slate-700">全体設定</span>
              」をそのまま使います。
            </p>

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm text-slate-800">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2">項目</th>
                    <th className="px-3 py-2">出どころ</th>
                    <th className="px-3 py-2">値</th>
                  </tr>
                </thead>
                <tbody>
                  <SimpleRow
                    label={FIELD_LABEL.slotDurationMinutes}
                    overridden={data.effective.overriddenFields.includes("slotDurationMinutes")}
                    value={`${data.effective.slotDurationMinutes} 分`}
                    globalValue={`${data.global.slotDurationMinutes} 分`}
                  />
                  <SimpleRow
                    label={FIELD_LABEL.totalSessions}
                    overridden={data.effective.overriddenFields.includes("totalSessions")}
                    value={`${data.effective.totalSessions} 回`}
                    globalValue={`${data.global.totalSessions} 回`}
                  />
                  <SimpleRow
                    label={FIELD_LABEL.timezone}
                    overridden={data.effective.overriddenFields.includes("timezone")}
                    value={data.effective.timezone}
                    globalValue={data.global.timezone}
                  />
                  <SimpleRow
                    label={FIELD_LABEL.slotEarliestHour}
                    overridden={data.effective.overriddenFields.includes("slotEarliestHour")}
                    value={`${data.effective.slotEarliestHour}:00`}
                    globalValue={`${data.global.slotEarliestHour}:00`}
                  />
                  <SimpleRow
                    label={FIELD_LABEL.slotLatestHour}
                    overridden={data.effective.overriddenFields.includes("slotLatestHour")}
                    value={`${data.effective.slotLatestHour}:00`}
                    globalValue={`${data.global.slotLatestHour}:00`}
                  />
                  <SimpleRow
                    label={FIELD_LABEL.allowWeekends}
                    overridden={data.effective.overriddenFields.includes("allowWeekends")}
                    value={data.effective.allowWeekends ? "許可" : "不可"}
                    globalValue={data.global.allowWeekends ? "許可" : "不可"}
                  />
                  <SimpleRow
                    label={FIELD_LABEL.availabilitySlotOptions}
                    overridden={data.effective.overriddenFields.includes("availabilitySlotOptions")}
                    value={`${data.effective.availabilitySlotOptions.length} 件の選択肢`}
                    globalValue={`${data.global.availabilitySlotOptions.length} 件の選択肢`}
                  />
                  <SimpleRow
                    label={FIELD_LABEL.partnerExtraQuestionsByRound}
                    overridden={data.effective.overriddenFields.includes("partnerExtraQuestionsByRound")}
                    value={`${Object.keys(data.effective.partnerExtraQuestionsByRound).length} 回分の設問`}
                    globalValue={`${Object.keys(data.global.partnerExtraQuestionsByRound).length} 回分の設問`}
                  />
                  <SimpleRow
                    label={FIELD_LABEL.sessionGuidelinesByRound}
                    overridden={data.effective.overriddenFields.includes("sessionGuidelinesByRound")}
                    value={`${Object.keys(data.effective.sessionGuidelinesByRound).length} 回分のガイドライン`}
                    globalValue={`${Object.keys(data.global.sessionGuidelinesByRound).length} 回分のガイドライン`}
                  />
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {data.override?.updatedAt
                ? `企業上書きの最終更新: ${new Date(data.override.updatedAt).toLocaleString("ja-JP")}`
                : "企業上書きはまだ設定されていません（全項目とも全体設定を使用）。"}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

function SimpleRow({
  label,
  overridden,
  value,
  globalValue,
}: {
  label: string;
  overridden: boolean;
  value: string;
  globalValue: string;
}) {
  return (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-900">{label}</td>
      <td className="px-3 py-2">
        {overridden ? (
          <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-900">
            企業上書き
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            全体設定
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-slate-800">
        {value}
        {overridden ? (
          <span className="ml-2 text-xs text-slate-500">(全体: {globalValue})</span>
        ) : null}
      </td>
    </tr>
  );
}
