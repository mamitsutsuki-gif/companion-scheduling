/** 日程調整の説明文（マッチ画面のチャット冒頭・折りたたみで配置） */

/**
 * チャット欄の最上部に常時 1 行で出す「超短縮版」サマリ。
 */
export const SCHEDULE_SUMMARY_PARTNER =
  "流れ: ① 候補日を送る → ② クライアントが ◯× で回答 → ③ あなたが ◯ から日程を決定 → 双方に確定メール送信";

export const SCHEDULE_SUMMARY_CLIENT =
  "流れ: ① パートナーから候補日が届く → ② 各候補に ◯× を入力 → ③ パートナーが日程を決定 → 双方に確定メール送信";

export type SchedulingGuideAudience = "partner" | "client";

export type SchedulingGuideSection = {
  number: string;
  title: string;
  paragraphs?: string[];
  flowCaption?: string;
  flowSteps?: string[];
  bullets?: string[];
  /** bullets の直後に続く段落 */
  paragraphsAfterBullets?: string[];
  notes?: string[];
};

export type SchedulingGuideDocument = {
  documentTitle: string;
  sections: SchedulingGuideSection[];
};

export const SCHEDULING_GUIDE_PARTNER: SchedulingGuideDocument = {
  documentTitle: "日程調整機能の使い方（詳しいご案内）",
  sections: [
    {
      number: "1",
      title: "チャット機能について",
      paragraphs: [
        "チャット上でクライアントとやり取りが可能です。",
        "1on1セッションの日程調整の目的でご利用ください。",
      ],
    },
    {
      number: "2",
      title: "日程調整の流れ",
      paragraphs: ["候補日を送れるのは、パートナー側のみです。"],
      flowCaption: "基本の流れ",
      flowSteps: [
        "パートナーが候補日を送る",
        "クライアントがアプリ上で ◯・× を回答",
        "すべて × の場合、パートナーが候補日を再送",
        "パートナーが ◯ のついた候補から「この日に決定」を押下",
        "双方に確定メールが届くため、各自でカレンダーへ予定を登録",
      ],
    },
    {
      number: "3",
      title: "1on1セッション日程について",
      paragraphs: [
        "まずは初回の1on1セッションの日程調整を行ってください。",
        "日程の決め方は、以下どちらでも問題ありません。",
      ],
      bullets: [
        "毎回の1on1終了時に次回日程を決定する",
        "あらかじめ全日程をまとめて決定する",
      ],
      paragraphsAfterBullets: [
        "クライアントと相談のうえ、進めやすい方法で調整してください。",
        "なお、必ず「月2回ペース」で、契約期間内に所定回数を実施してください。",
        "クライアント都合を含め、実施継続が難しい見込みとなった場合は、その時点で速やかにサポートデスクへご連絡ください。",
      ],
    },
    {
      number: "4",
      title: "日程変更について",
      paragraphs: [
        "各回の確定済み日程の横に「日程変更依頼」ボタンがあります。",
        "クライアントから変更希望があった場合でも、候補日を送れるのはパートナー側のみです。必要に応じて候補日を再度お送りください。",
        "日程調整が難航している場合は、先にチャットで希望日時をすり合わせたうえで候補日を送ると、調整がスムーズになります。",
      ],
    },
  ],
};

export const SCHEDULING_GUIDE_CLIENT: SchedulingGuideDocument = {
  documentTitle: "日程調整機能の使い方（詳しいご案内）",
  sections: [
    {
      number: "1",
      title: "チャット機能について",
      paragraphs: [
        "担当パートナーと、チャット上でやり取りが可能です。",
        "1on1の日程調整の目的でご利用ください。",
      ],
    },
    {
      number: "2",
      title: "日程調整の流れ",
      paragraphs: ["候補日は、担当パートナーよりお送りします。"],
      flowCaption: "基本の流れ",
      flowSteps: [
        "パートナーから候補日が届く",
        "アプリ上で各候補日に ◯・× を入力",
        "パートナーが ◯ のついた候補から日程を決定",
        "双方に確定メールが届くため、各自でカレンダーへ予定を登録",
      ],
      notes: ["※ すべて × の場合は、パートナーより改めて候補日をお送りします。"],
    },
    {
      number: "3",
      title: "1on1セッション日程について",
      paragraphs: [
        "1on1セッションは、月2回ペースで実施します。",
        "次回日程を毎回調整する形でも、あらかじめまとめて決定する形でも問題ありません。担当パートナーとご相談のうえ、ご都合の良い形で進めてください。",
      ],
    },
    {
      number: "4",
      title: "日程変更について",
      paragraphs: [
        "日程変更をご希望の場合は、チャットにて担当パートナーへご連絡ください。",
        "変更候補日はパートナー側からお送りしますので、アプリ上で ◯・× をご回答ください。",
      ],
    },
  ],
};

export function getSchedulingGuide(audience: SchedulingGuideAudience): SchedulingGuideDocument {
  return audience === "partner" ? SCHEDULING_GUIDE_PARTNER : SCHEDULING_GUIDE_CLIENT;
}
