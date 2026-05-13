import { requireRole } from "@/lib/require-user";
import { DesignPreviewGrid } from "./variants";

/**
 * デザイン方向性プレビュー（管理者専用・一時ページ）。
 *
 * /admin/* は section layout で ADMIN / ADMIN_ASSISTANT のみアクセス可。
 * 採用方向が決まったら、このページとセットの `variants.tsx` を削除する。
 */
export default async function DesignPreviewPage() {
  await requireRole(["ADMIN", "ADMIN_ASSISTANT"]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.18em] text-indigo-700 uppercase">
          Design Preview
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          画面デザインの方向性プレビュー
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          ダッシュボード上部に出る「ヘッダ／ヒーロー／状態バナー／次のアクション／担当ペアカード」を、
          3 つのデザイン方向性で並べました。実際のアプリ全体は <strong>まだ変えていません</strong>。
          採用したい方向性を選んでください（その後、選ばれた方向で全画面に展開します）。
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>
            <strong>Variant A</strong> — 現状の延長。色味と部品を整え、落ち着いた印象。
          </li>
          <li>
            <strong>Variant B</strong> — ネイビー × ゴールドの高単価 SaaS 系。経営層向けに見える。
          </li>
          <li>
            <strong>Variant C</strong> — ティール × オフホワイトの明るいモダン系。HR / People チーム向け。
          </li>
        </ul>
      </header>

      <DesignPreviewGrid />
    </div>
  );
}
