/** 日程調整の説明文（マッチ画面の日程調整タブで配置） */

export const SCHEDULE_SUMMARY_PARTNER =
  "流れ: ① 対応可能な時間帯を登録 → ② クライアントが参加可能な日時を選択 → ③ あなたが日程を確定 → 双方に確定メール送信";

export const SCHEDULE_SUMMARY_CLIENT =
  "流れ: ① 担当パートナーからご案内可能な日時が届く → ② 参加可能な日時をすべて選択 → ③ 担当パートナーが日程を確定 → 双方に確定メール送信";

export type SchedulingGuideAudience = "partner" | "client";

export type SchedulingGuideSection = {
  number: string;
  title: string;
  paragraphs?: string[];
  flowCaption?: string;
  flowSteps?: string[];
  bullets?: string[];
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
      paragraphs: ["候補日時を提示できるのは、担当パートナー側のみです。"],
      flowCaption: "基本の流れ",
      flowSteps: [
        "担当パートナーが対応可能な時間帯を登録し、候補日時を提示",
        "クライアントが参加可能な日時をすべて選択して回答",
        "すべて参加不可の場合、担当パートナーが別の時間帯を再提示",
        "担当パートナーが参加可能な日時の中から1件を選び、日程を確定",
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
      ],
    },
    {
      number: "4",
      title: "日程変更について",
      paragraphs: [
        "各回の確定済み日程の横に「変更希望」ボタンがあります。",
        "クライアントから変更希望があった場合でも、候補日時を提示できるのは担当パートナー側のみです。",
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
      paragraphs: ["ご案内可能な日時は、担当パートナーよりお送りします。"],
      flowCaption: "基本の流れ",
      flowSteps: [
        "担当パートナーからご案内可能な日時（候補日時）が届く",
        "日程調整タブで、参加可能な日時をすべて選択して回答",
        "担当パートナーが参加可能な日時の中から日程を確定",
        "双方に確定メールが届くため、各自でカレンダーへ予定を登録",
      ],
      notes: ["※ すべて参加不可の場合は、「別候補を希望する」からお知らせください。"],
    },
    {
      number: "3",
      title: "1on1セッション日程について",
      paragraphs: [
        "1on1セッションは、次回日程を毎回調整する形でも、あらかじめまとめて決定する形でも問題ありません。担当パートナーとご相談のうえ、ご都合の良い形で進めてください。",
      ],
    },
    {
      number: "4",
      title: "日程変更について",
      paragraphs: [
        "日程変更をご希望の場合は、「日程調整」タブの各回の「変更希望」ボタンからお送りください。",
        "変更候補日時は担当パートナー側からお送りしますので、日程調整タブからご回答ください。",
      ],
    },
  ],
};

export function getSchedulingGuide(audience: SchedulingGuideAudience): SchedulingGuideDocument {
  return audience === "partner" ? SCHEDULING_GUIDE_PARTNER : SCHEDULING_GUIDE_CLIENT;
}
