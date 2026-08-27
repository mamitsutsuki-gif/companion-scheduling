import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bullets(items) {
  return `<ul class="bullets">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function cover({ eyebrow, title, body, note, image, imageCaption }) {
  return `
<section class="slide sheet">
  <div class="brand-bar">
    <img class="brand" src="assets/motiv-iji-logo-horizontal.png" alt="" />
    <span class="brand-tag">個別伴走プラン 公式操作ガイド</span>
  </div>
  <div class="sheet-grid">
    <div class="sheet-copy">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h1>${title}</h1>
      <p class="para">${body}</p>
      ${note ? `<p class="tip">${esc(note)}</p>` : ""}
    </div>
    <figure class="sheet-fig">
      <img src="assets/${esc(image)}" alt="" />
      ${imageCaption ? `<figcaption>${esc(imageCaption)}</figcaption>` : ""}
    </figure>
  </div>
</section>`;
}

function sheet({ eyebrow, title, who, purpose, how, image, imageCaption, tip, badgeColor = "indigo" }) {
  return `
<section class="slide sheet theme-${esc(badgeColor)}">
  <div class="brand-bar">
    <img class="brand" src="assets/motiv-iji-logo-horizontal.png" alt="" />
    <span class="brand-tag">個別伴走プラン 公式操作ガイド</span>
  </div>
  <div class="sheet-grid">
    <div class="sheet-copy">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h1>${esc(title)}</h1>
      ${who ? `<p class="who"><span>担当</span>${esc(who)}</p>` : ""}
      <h2>目的・ポイント</h2>
      <p class="para">${esc(purpose)}</p>
      <h2>操作・やること</h2>
      ${bullets(how)}
      ${tip ? `<p class="tip">${esc(tip)}</p>` : ""}
    </div>
    <figure class="sheet-fig">
      <img src="assets/${esc(image)}" alt="${esc(title)}" />
      ${imageCaption ? `<figcaption>${esc(imageCaption)}</figcaption>` : ""}
    </figure>
  </div>
</section>`;
}

const slides = [];

// 1. 表紙
slides.push(
  cover({
    eyebrow: "Individual Companion Plan",
    title: "ライフラインチャート<br />入力・活用ガイド",
    body: "これまでの人生の出来事（喜び・挫折）を振り返り、自分の価値観やエネルギーの源泉を言語化するためのステップガイドです。受講者本人の操作画面付きで解説しています。",
    note: "【対象】クライアント（受講者本人） ／ 対話パートナー",
    image: "shot-fx-overview.png",
    imageCaption: "ライフラインチャートの全体像",
  }),
);

// 2. 目的・なぜやるのか
slides.push(
  sheet({
    eyebrow: "PURPOSE",
    title: "ライフラインチャートの目的",
    who: "受講者本人（クライアント）",
    purpose: "過去の感情の起伏を可視化し、「自分の価値観を明確にする」「エネルギーの源泉を知る」ためのシートです。",
    how: [
      "自分の価値観を明確にする：何を大切だと感じ、何を良いと判断するかの「心のものさし」を掴む",
      "エネルギーの源泉を知る：どんな時にやる気が湧き、どんな環境で力を発揮できるかを理解する",
      "挫折パターンの傾向を把握：どんな状況で気持ちが下がりやすいかを知り、今後の対処に活かす",
      "1on1セッションの基盤：対話パートナーと共有し、本質的な目標設定や対話に繋げる",
    ],
    tip: "💡 上司やパートナーへの見栄えを気にする必要はありません。ありのままの感情の動きを振り返りましょう。",
    image: "shot-fx-overview.png",
    imageCaption: "自己理解を深める3つのステップ",
    badgeColor: "indigo",
  }),
);

// 3. 画面導線（どこにあるのか）
slides.push(
  sheet({
    eyebrow: "STEP 0 画面導線",
    title: "ホームからライフラインを開く",
    who: "受講者本人（クライアント）",
    purpose: "ログイン後、ホーム画面のセッションルームから「ライフライン」タブにアクセスします。",
    how: [
      "ホーム画面の「セッション・研修ルーム」カードをクリックする",
      "担当パートナーとの専用ルーム画面が開きます",
      "上部タブ一覧から「ライフライン」をクリックする",
      "ライフラインチャートの入力・グラフ閲覧画面が表示されます",
    ],
    tip: "💡 パソコン・スマートフォンどちらからでも入力・保存が可能です。",
    image: "shot-fx-entrance.png",
    imageCaption: "ホーム画面 ＞ ルーム ＞ ライフラインタブへの導線",
    badgeColor: "indigo",
  }),
);

// 4. 出来事の追加・感情スコア入力
slides.push(
  sheet({
    eyebrow: "STEP 1 出来事の入力",
    title: "人生の出来事（波）を記録する",
    who: "受講者本人（クライアント）",
    purpose: "過去の感情が大きく動いた出来事を時系列で追加し、当時の手応えや理由を記入します。",
    how: [
      "「人生の出来事を追加する」ボタンを押してカードを作成する",
      "「年齢・時期」と「感情スコア（-5〜+5）」を入力する（+5:大歓喜 / -5:大挫折）",
      "「タイトル」と「出来事の詳細（何があったか）」を簡潔に書く",
      "「なぜ気持ちが上がった／下がったか（理由）」を具体的に書く",
      "「この出来事から見える価値観・強み・気づき」を言語化する",
    ],
    tip: "💡 最初は 3〜5 件程度の大きなターニングポイント（成功・挫折）から書き始めるのがおすすめです。",
    image: "shot-fx-event-input.png",
    imageCaption: "出来事・感情スコア・理由・気づきの入力画面",
    badgeColor: "indigo",
  }),
);

// 5. プライバシー・鍵（🔒）機能
slides.push(
  sheet({
    eyebrow: "STEP 2 本音で書ける安心設計",
    title: "プライバシー保護と鍵機能",
    who: "受講者本人（クライアント）",
    purpose: "エピソードの個人的な詳細は上司には一切公開されません。パートナーには対話のために共有されます。",
    how: [
      "【上司・人事には非公開】：エピソード本文や理由は上司・人事には見えません（グラフと公開気づきのみ共有）",
      "【パートナーには共有】：1on1セッションでの自己探求や対話を深めるため、パートナーには詳細を含め共有されます",
      "【鍵（🔒）機能】：特定の出来事の「気づき」も上司に隠したい場合は「鍵付き」にチェックを入れます",
      "鍵付きの項目は、上司画面では「🔒 非公開」と表示されます（パートナーには表示されます）",
    ],
    tip: "🛡️ 上司に見られる心配がないため、安心して本音の気持ちやターニングポイントを記述できます。",
    image: "shot-fx-privacy-lock.png",
    imageCaption: "公開範囲のルールと鍵（🔒）設定",
    badgeColor: "emerald",
  }),
);

// 6. グラフ可視化とまとめ入力
slides.push(
  sheet({
    eyebrow: "STEP 3 可視化 ＆ まとめ",
    title: "価値観とエネルギー源泉のまとめ",
    who: "受講者本人（クライアント）",
    purpose: "出来事全体の起伏グラフを俯瞰し、「なぜ頑張りたいのか」「何を大切にしたいか」を総括します。",
    how: [
      "画面上部の折れ線グラフで、自分の人生のエネルギーの推移を確認する",
      "画面下部のまとめ欄「エネルギーの源泉（何があれば頑張れるか）」を記入する",
      "「大切にしている価値観（判断基準・大切にしたい軸）」を記入する",
      "入力後、画面内の「保存する」ボタンを押して完了する",
    ],
    tip: "🤝 ここで言語化したまとめは、1on1セッションでパートナーと対話し、さらに深めていくことができます。",
    image: "shot-fx-graph-summary.png",
    imageCaption: "感情スコアの折れ線グラフ ＆ まとめ記入欄",
    badgeColor: "emerald",
  }),
);

// 7. まとめ・セッションでの活用
slides.push(
  sheet({
    eyebrow: "SUMMARY",
    title: "まとめ：セッションでの活用方法",
    who: "受講者本人 ＆ 対話パートナー",
    purpose: "ライフラインチャートは一度書いて終わりではなく、伴走期間中の大切な「現在地と原点」になります。",
    how: [
      "1on1セッションで共有する：パートナーと一緒に振り返り、自分の強みや行動特性を深く探求する",
      "日々の目標・FTAと紐付ける：「大切にしたい価値観」に沿った目標になっているかを確認する",
      "迷ったときの立ち返り先にする：仕事で壁にぶつかった時、自分のエネルギーの源泉を再確認する",
      "プログラム進行中に追記・修正可能：新たな気づきがあればいつでも更新できます",
    ],
    tip: "✨ 自分自身を深く知ることが、ブレない自信と持続的なモチベーションを生み出します。",
    image: "shot-fx-overview.png",
    imageCaption: "自己探求から成長アクションへの繋がり",
    badgeColor: "indigo",
  }),
);

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>ライフラインチャート 入力・活用ガイド</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&family=Noto+Sans+JP:wght@500;700;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: #0f172a;
      color: #0f172a;
      font-family: 'Plus Jakarta Sans', 'Noto Sans JP', sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .slide {
      width: 1920px;
      height: 1080px;
      position: relative;
      background: #ffffff;
      overflow: hidden;
      page-break-after: always;
      display: flex;
      flex-direction: column;
    }
    .brand-bar {
      position: absolute;
      top: 36px;
      left: 64px;
      right: 64px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 10;
    }
    .brand {
      height: 42px;
      width: auto;
      object-fit: contain;
    }
    .brand-tag {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #475569;
      background: #f1f5f9;
      padding: 8px 20px;
      border-radius: 9999px;
      border: 1px solid #e2e8f0;
    }

    /* Sheet Layout */
    .sheet-grid {
      display: grid;
      grid-template-columns: 880px 1fr;
      gap: 40px;
      padding: 88px 64px 44px 64px;
      height: 100%;
      align-items: center;
    }
    .sheet-copy {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .eyebrow {
      display: inline-block;
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #4f46e5;
      margin-bottom: 10px;
    }
    .theme-emerald .eyebrow {
      color: #059669;
    }
    h1 {
      font-size: 48px;
      font-weight: 900;
      line-height: 1.25;
      color: #0f172a;
      margin-bottom: 16px;
      letter-spacing: -0.02em;
    }
    .who {
      font-size: 19px;
      font-weight: 800;
      color: #1e293b;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .who span {
      font-size: 14px;
      font-weight: 900;
      background: #e2e8f0;
      color: #334155;
      padding: 4px 14px;
      border-radius: 6px;
      text-transform: uppercase;
    }
    h2 {
      font-size: 18px;
      font-weight: 900;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: 16px;
      margin-bottom: 8px;
    }
    .para {
      font-size: 23px;
      line-height: 1.55;
      color: #1e293b;
      font-weight: 600;
      margin-bottom: 14px;
    }
    .bullets {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }
    .bullets li {
      font-size: 22px;
      line-height: 1.45;
      color: #0f172a;
      font-weight: 700;
      position: relative;
      padding-left: 32px;
    }
    .bullets li::before {
      content: "•";
      position: absolute;
      left: 6px;
      color: #4f46e5;
      font-size: 30px;
      line-height: 1;
      top: -2px;
    }
    .theme-emerald .bullets li::before {
      color: #059669;
    }
    .tip {
      font-size: 18px;
      line-height: 1.55;
      color: #0f172a;
      background: #f8fafc;
      border-left: 6px solid #4f46e5;
      padding: 14px 22px;
      border-radius: 0 16px 16px 0;
      margin-top: 12px;
      font-weight: 600;
    }
    .theme-emerald .tip {
      border-left-color: #059669;
      background: #f0fdf4;
    }

    .sheet-fig {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 28px;
      padding: 16px;
      box-shadow: 0 24px 48px -15px rgba(0,0,0,0.08);
      max-height: 890px;
      width: 100%;
    }
    .sheet-fig img {
      width: 100%;
      height: auto;
      max-height: 800px;
      object-fit: cover;
      object-position: center;
      border-radius: 18px;
    }
    .sheet-fig figcaption {
      margin-top: 14px;
      font-size: 17px;
      font-weight: 800;
      color: #475569;
      letter-spacing: 0.02em;
    }
  </style>
</head>
<body>
  ${slides.join("\n")}
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, "index.html"), html);
console.log("Generated index.html with", slides.length, "slides");
