/** 伴走シートの共有範囲説明（表示専用。権限ロジックの正本ではない） */

export type SheetAudienceKey =
  | "pdca"
  | "reflection"
  | "skillCheck"
  | "summaryReport"
  | "actionBrakeAnalysis";

export type AudienceAccess = "edit" | "view" | "view_partial";

export type AudienceLine = {
  role: "client" | "partner" | "supervisor" | "hr";
  label: string;
  access: AudienceAccess;
  note?: string;
};

export type SheetAudienceDef = {
  lines: AudienceLine[];
  footnote?: string;
};

function accessLabel(access: AudienceAccess): string {
  if (access === "edit") return "編集";
  return "閲覧";
}

export function formatAudienceLine(line: AudienceLine): string {
  const base = `${line.label}: ${accessLabel(line.access)}`;
  return line.note ? `${base}（${line.note}）` : base;
}

export const SHEET_AUDIENCE: Record<SheetAudienceKey, SheetAudienceDef> = {
  pdca: {
    lines: [
      { role: "client", label: "受講者", access: "edit" },
      { role: "partner", label: "パートナー", access: "view" },
      { role: "supervisor", label: "上司", access: "view", note: "コメント入力可" },
      { role: "hr", label: "人事", access: "view" },
    ],
  },
  reflection: {
    lines: [
      { role: "client", label: "受講者", access: "edit" },
      { role: "partner", label: "パートナー", access: "view" },
      { role: "supervisor", label: "上司", access: "view" },
      { role: "hr", label: "人事", access: "view" },
    ],
  },
  skillCheck: {
    lines: [
      { role: "client", label: "受講者", access: "edit", note: "自己評価" },
      { role: "partner", label: "パートナー", access: "view" },
      { role: "supervisor", label: "上司", access: "edit", note: "上司評価" },
      { role: "hr", label: "人事", access: "view" },
    ],
    footnote: "双方の入力が完了するまで、相手の評価は表示されません。",
  },
  summaryReport: {
    lines: [
      { role: "partner", label: "パートナー", access: "view", note: "コメント入力可" },
      {
        role: "supervisor",
        label: "上司",
        access: "view_partial",
        note: "集計は常時、コメントは提出後",
      },
      {
        role: "hr",
        label: "人事",
        access: "view_partial",
        note: "集計は常時、コメントは提出後",
      },
    ],
    footnote: "受講者向けのタブはありません（パートナー・上司・人事・運用管理者向け）。",
  },
  actionBrakeAnalysis: {
    lines: [
      { role: "client", label: "受講者", access: "edit" },
      { role: "partner", label: "パートナー", access: "view" },
      { role: "supervisor", label: "上司", access: "view" },
      { role: "hr", label: "人事", access: "view" },
    ],
  },
};
