/** アプリ内外で統一して使うサービス表示名（必要なら .env で差し替え可能にする） */
export const APP_DISPLAY_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "モチベイジクラウド";

export const APP_SHORT_DESCRIPTION =
  "1対1の伴走関係に合わせた日程調整と、迷わず使えるシンプルなコミュニケーション。";
