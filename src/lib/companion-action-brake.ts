import type { LifelineViewMode } from "@/lib/companion-access";

function trim(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export const ACTION_BRAKE_TEXT_MAX = 4000;

/**
 * 行き詰まり分析（認知行動療法の思考記録）
 * 記入順の推奨: ①出来事 → ③感情 → ④行動 → ⑤結果 → ②自動思考 → 書き換え
 */
export type ActionBrakeEntry = {
  id: string;
  title: string;
  /** 紐づく PDCA 記録（任意） */
  pdcaEntryId: string | null;
  /** ①出来事 */
  eventText: string;
  /** ③感情 */
  emotionText: string;
  /** ④とった行動 */
  actionTakenText: string;
  /** ⑤結果 */
  resultText: string;
  /** ②自動思考（①③④⑤のあとに書く） */
  automaticThoughtText: string;
  /** 自動思考の書き換え */
  thoughtRewriteText: string;
  /** 思考の癖 */
  habitNotesText: string;
  /** 次回から変えたいこと（旧データは habitNotesText にまとまっている場合あり） */
  nextChangeText: string;
  /** 上司・人事には本文を非公開（パートナー・本人は閲覧可） */
  locked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ActionBrakeStore = {
  userId: string;
  companyId: string;
  entries: ActionBrakeEntry[];
  updatedAt: string;
};

const EMPTY_REDACTED_TEXT_FIELDS = {
  title: "",
  pdcaEntryId: null as string | null,
  eventText: "",
  emotionText: "",
  actionTakenText: "",
  resultText: "",
  automaticThoughtText: "",
  thoughtRewriteText: "",
  habitNotesText: "",
  nextChangeText: "",
};

/** 上司・人事向けに鍵付きエントリの本文を除去する */
export function redactActionBrakeEntryForManager(entry: ActionBrakeEntry): ActionBrakeEntry {
  if (!entry.locked) return entry;
  return {
    ...entry,
    ...EMPTY_REDACTED_TEXT_FIELDS,
    locked: true,
  };
}

/**
 * 閲覧者ごとの公開範囲（ライフラインと同じ viewMode を流用）。
 * - full / self: 全文
 * - manager（上司・人事）: 鍵付きは本文非公開
 */
export function filterActionBrakeStoreForViewer(
  store: ActionBrakeStore,
  mode: LifelineViewMode,
): ActionBrakeStore {
  if (mode === "full" || mode === "self") return store;
  if (mode === "none") return { ...store, entries: [] };
  return {
    ...store,
    entries: store.entries.map((e) => redactActionBrakeEntryForManager(e)),
  };
}

export function isActionBrakeEntryHiddenFromManager(entry: ActionBrakeEntry): boolean {
  return entry.locked;
}

export function normalizeActionBrakeEntry(input: unknown, fallbackId: string): ActionBrakeEntry | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const id = trim(o.id, 80) || fallbackId;
  const now = new Date().toISOString();
  return {
    id,
    title: trim(o.title, 200),
    pdcaEntryId:
      typeof o.pdcaEntryId === "string" && o.pdcaEntryId.trim()
        ? o.pdcaEntryId.trim().slice(0, 80)
        : null,
    eventText: trim(o.eventText, ACTION_BRAKE_TEXT_MAX),
    emotionText: trim(o.emotionText, ACTION_BRAKE_TEXT_MAX),
    actionTakenText: trim(o.actionTakenText, ACTION_BRAKE_TEXT_MAX),
    resultText: trim(o.resultText, ACTION_BRAKE_TEXT_MAX),
    automaticThoughtText: trim(o.automaticThoughtText, ACTION_BRAKE_TEXT_MAX),
    thoughtRewriteText: trim(o.thoughtRewriteText, ACTION_BRAKE_TEXT_MAX),
    habitNotesText: trim(o.habitNotesText, ACTION_BRAKE_TEXT_MAX),
    nextChangeText: trim(o.nextChangeText, ACTION_BRAKE_TEXT_MAX),
    locked: Boolean(o.locked),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

export function normalizeActionBrakeStore(
  userId: string,
  companyId: string,
  input: unknown,
): ActionBrakeStore {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const entriesRaw = Array.isArray(raw.entries) ? raw.entries : [];
  const entries: ActionBrakeEntry[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < entriesRaw.length && entries.length < 120; i++) {
    const row = normalizeActionBrakeEntry(entriesRaw[i], `brake-${i + 1}`);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    entries.push(row);
  }
  entries.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return {
    userId,
    companyId,
    entries,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}
