import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

export default function PartnerMeetingLinksHelpPage() {
  return (
    <AuthShell
      title="オンライン会議URLの設定方法"
      subtitle="パートナー向け — Zoom と Google Meet の両方を登録してください。実際に使うのは、クライアント所属企業の設定で選ばれた方だけです。"
    >
      <div className="prose prose-slate max-w-none space-y-8 text-sm leading-relaxed text-slate-800">
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
          <h2 className="mt-0 text-lg font-semibold text-indigo-950">Zoom（常設ルーム）</h2>
          <p>
            Zoom では、<strong>期間固定のルームを1つ</strong>作成し、その URL・ミーティング ID・パスコードを登録してください。
            毎回同じルームを使う想定です。
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Zoom にログインし、「スケジュール」または「ミーティング」から新規ミーティングを作成します。</li>
            <li>
              「繰り返し」や「時間無制限」など、<strong>常設ルームとして使える設定</strong>にします（具体的な項目名は Zoom のバージョンにより異なります）。
            </li>
            <li>発行された参加 URL、ミーティング ID、パスコードをアプリの登録画面に入力します。</li>
          </ol>
          <p className="text-xs text-slate-600">
            詳細は{" "}
            <a
              href="https://support.zoom.com/hc/ja"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-800 underline"
            >
              Zoom 公式ヘルプ
            </a>
            も参照してください。
          </p>
        </section>

        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <h2 className="mt-0 text-lg font-semibold text-emerald-950">Google Meet（繰り返し予定）</h2>
          <p>
            Google Meet では、<strong>Google カレンダーで毎週繰り返しの予定</strong>を1つ作成し、その予定に付いた Meet URL を登録してください。
            日付が古くなりすぎた予定の Meet は永久に使える保証がないため、繰り返し設定を推奨します。
            繰り返しにしても <strong>Meet URL は毎回同じ</strong> です。
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Google カレンダーを開き、任意の日時で新規予定を作成します（開始日はいつでも構いません）。</li>
            <li>「Google Meet のビデオ通話を追加」をオンにし、Meet URL が生成されることを確認します。</li>
            <li>
              繰り返しを「毎週」などに設定して保存します。これで古い日付の予定が残り続け、Meet URL も維持されます。
            </li>
            <li>予定の詳細または説明欄に表示される Meet URL（https://meet.google.com/...）をアプリに入力します。</li>
          </ol>
          <p className="text-xs text-slate-600">
            詳細は{" "}
            <a
              href="https://support.google.com/calendar/answer/9901136?hl=ja"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-900 underline"
            >
              Google カレンダーで Meet を追加する
            </a>
            も参照してください。
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="mt-0 text-base font-semibold text-slate-900">よくある質問</h2>
          <dl className="space-y-4">
            <div>
              <dt className="font-semibold text-slate-900">両方登録する必要がありますか？</dt>
              <dd className="mt-1 text-slate-700">
                はい。企業ごとに Zoom か Google Meet のどちらかが選ばれ、日程確定時にその URL が使われます。確定後に URL を変更しても、すでに確定した過去のセッションの URL は変わりません。
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">登録後に URL を変えられますか？</dt>
              <dd className="mt-1 text-slate-700">
                はい。「会議リンク設定」から Zoom と Google Meet の両方を更新できます。変更は<strong>これから確定する日程</strong>以降に反映されます。
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <p className="mt-8 text-center text-sm text-slate-600">
        <Link href="/register/complete-profile" className="font-medium text-indigo-700 no-underline hover:underline">
          登録画面に戻る
        </Link>
      </p>
    </AuthShell>
  );
}
