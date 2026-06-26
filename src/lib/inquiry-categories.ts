/** 問い合わせ種別（クライアント・パートナー共通） */
export const INQUIRY_CATEGORIES = [
  "コーチを変更したい",
  "ツールの使い方がわからない",
  "日程調整の方法がわからない",
  "1on1の頻度に関して不明なことがある",
  "アプリの操作方法がわからない",
  "その他",
] as const;

export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number];

export function isInquiryCategory(value: string): value is InquiryCategory {
  return (INQUIRY_CATEGORIES as readonly string[]).includes(value);
}

export const INQUIRY_REPLY_NOTICE =
  "※2営業日を目安にご返信いたします。お時間をいただき恐縮ですが、何卒よろしくお願いいたします。";
