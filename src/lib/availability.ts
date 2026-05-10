/**
 * 対応可能時間（Availability slots）の共有ロジック。
 * - 管理者が AppSettings で選択肢を編集する。
 * - クライアントは登録時に複数選択。
 * - パートナーは管理者がユーザー管理で複数選択。
 * - 日程調整画面では両者の選択肢を並べて表示する。
 */

export type AvailabilitySlotOption = {
  id: string;
  label: string;
};

export const DEFAULT_AVAILABILITY_OPTIONS: AvailabilitySlotOption[] = [
  { id: "weekday-08-09", label: "平日 8:00〜9:00" },
  { id: "weekday-09-12", label: "平日 9:00〜12:00" },
  { id: "weekday-12-18", label: "平日 12:00〜18:00" },
  { id: "weekday-18-20", label: "平日 18:00〜20:00" },
];

export const AVAILABILITY_NOTICE =
  "日程調整は、担当の対話パートナーと個別にご相談のうえ決定します。今回の選択は、対話パートナーのアサインを行うためのものです。現時点で日時が確定するわけではありませんので、ご安心ください。対応可能性のある時間帯を、できるだけ多くご選択ください。";

/** 入力をサニタイズして AvailabilitySlotOption[] へ正規化。 */
export function normalizeAvailabilityOptions(input: unknown): AvailabilitySlotOption[] {
  if (!Array.isArray(input)) return [...DEFAULT_AVAILABILITY_OPTIONS];
  const seen = new Set<string>();
  const out: AvailabilitySlotOption[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim().slice(0, 80) : "";
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 120) : "";
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
    if (out.length >= 32) break;
  }
  if (out.length === 0) return [...DEFAULT_AVAILABILITY_OPTIONS];
  return out;
}

/** 選択された slot id 配列を、選択肢一覧から有効なものだけに絞る。 */
export function normalizeAvailabilitySelections(
  input: unknown,
  options: AvailabilitySlotOption[],
): string[] {
  if (!Array.isArray(input)) return [];
  const valid = new Set(options.map((o) => o.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    if (!valid.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/** 選択ID配列を、ラベル文字列の配列に変換（表示用）。 */
export function labelsForSlotIds(
  ids: string[] | undefined,
  options: AvailabilitySlotOption[],
): string[] {
  if (!Array.isArray(ids)) return [];
  const map = new Map(options.map((o) => [o.id, o.label]));
  return ids.map((id) => map.get(id) ?? id);
}
