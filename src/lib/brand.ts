/** アプリ内外で統一して使うサービス表示名（必要なら .env で差し替え可能にする） */
export const APP_DISPLAY_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "モチベイジクラウド";

export const APP_SHORT_DESCRIPTION =
  "担当者とのセッション日程の調整、メッセージ、プログラムに応じた記録を、安全に行えるプラットフォームです。";
