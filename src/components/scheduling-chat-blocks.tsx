"use client";

import { z } from "zod";

const slotProposalPayloadSchema = z.object({
  negotiationId: z.string(),
  round: z.number(),
  durationMinutes: z.number(),
  timezone: z.string(),
  slots: z.array(
    z.object({
      id: z.string(),
      start: z.string(),
      end: z.string(),
    }),
  ),
});

const scheduleConfirmedPayloadSchema = z.object({
  negotiationId: z.string().optional(),
  sessionNumber: z.number().nullable().optional(),
  start: z.string(),
  end: z.string(),
  zoomUrl: z.string().nullable().optional(),
  zoomPass: z.string().nullable().optional(),
  icsContent: z.string().nullable().optional(),
  googleCalendarUrl: z.string().nullable().optional(),
  outlookCalendarUrl: z.string().nullable().optional(),
});

export type ChatSlotVoteState = "YES" | "NO" | null;
export type ChatVoteHandler = (
  negotiationId: string,
  slotId: string,
  vote: "YES" | "NO",
) => void | Promise<void>;

function fmt(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type SlotProposalCardProps = {
  payload: unknown;
  /** クライアントがチャットから直接 ○／× を選べるようにする場合に渡す */
  voteContext?: {
    canVote: boolean;
    voteForSlot: (slotId: string) => ChatSlotVoteState;
    onVote: ChatVoteHandler;
    pendingSlotId?: string | null;
  };
};

export function SlotProposalCard({ payload, voteContext }: SlotProposalCardProps) {
  const p = slotProposalPayloadSchema.safeParse(payload);
  if (!p.success) return null;
  const showVoteUI = Boolean(voteContext?.canVote);
  return (
    <div className="rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-white to-indigo-50/95 p-4 shadow-md shadow-indigo-100/40 ring-1 ring-indigo-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
        <span className="text-[11px] font-bold tracking-widest text-indigo-900 uppercase">
          Schedule
        </span>
        <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
          Round {p.data.round}
        </span>
      </div>
      <p className="mt-2 text-xs text-indigo-950/85">
        各枠 <strong>{p.data.durationMinutes} 分</strong>（案内 TZ: {p.data.timezone}）
      </p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-1">
        {p.data.slots.map((s, i) => {
          const current = voteContext?.voteForSlot(s.id) ?? null;
          const pending = voteContext?.pendingSlotId === s.id;
          return (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-white/90 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-900">
                {i + 1}
              </span>
              <div className="min-w-[10rem] flex-1">
                <p className="font-semibold tracking-tight text-slate-900">
                  {fmt(s.start)} 〜 {fmt(s.end)}
                </p>
              </div>
              {showVoteUI && voteContext ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void voteContext.onVote(p.data.negotiationId, s.id, "YES")}
                    className={`min-w-[3.5rem] rounded-md border px-2 py-1.5 text-sm font-semibold ${
                      current === "YES"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50"
                    } disabled:opacity-50`}
                  >
                    ○ 参加
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void voteContext.onVote(p.data.negotiationId, s.id, "NO")}
                    className={`min-w-[3.5rem] rounded-md border px-2 py-1.5 text-sm font-semibold ${
                      current === "NO"
                        ? "border-rose-500 bg-rose-500 text-white"
                        : "border-rose-300 bg-white text-rose-800 hover:bg-rose-50"
                    } disabled:opacity-50`}
                  >
                    × 不可
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {showVoteUI ? (
        <p className="mt-3 rounded-lg bg-indigo-600/90 px-3 py-2 text-center text-[11px] font-medium text-white">
          すべての候補に○／×を入力すると、自動的に送信されます。
        </p>
      ) : (
        <p className="mt-3 rounded-lg bg-indigo-600/90 px-3 py-2 text-center text-[11px] font-medium text-white">
          クライアントは○／× で回答してください。
        </p>
      )}
    </div>
  );
}

type ScheduleConfirmedCardProps = {
  payload: unknown;
};

function downloadIcs(filename: string, content: string) {
  try {
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    /* noop */
  }
}

export function ScheduleConfirmedCard({ payload }: ScheduleConfirmedCardProps) {
  const p = scheduleConfirmedPayloadSchema.safeParse(payload);
  if (!p.success) return null;
  const zoomBits = [];
  if (p.data.zoomUrl) zoomBits.push(p.data.zoomUrl);
  if (p.data.zoomPass) zoomBits.push(`パス: ${p.data.zoomPass}`);
  const sessionLabel = p.data.sessionNumber ? `第${p.data.sessionNumber}回 / ` : "";
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-100">
      <div className="text-[11px] font-bold tracking-wide uppercase">確定しました</div>
      <p className="mt-2 font-semibold">
        {sessionLabel}
        {fmt(p.data.start)} 〜 {fmt(p.data.end)}
      </p>
      {zoomBits.length ? <p className="mt-1 text-xs opacity-90">{zoomBits.join(" · ")}</p> : null}
      {(p.data.googleCalendarUrl || p.data.outlookCalendarUrl || p.data.icsContent || p.data.zoomUrl) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {p.data.zoomUrl ? (
            <a
              href={p.data.zoomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 no-underline hover:bg-emerald-100"
            >
              Zoomを開く
            </a>
          ) : null}
          {p.data.googleCalendarUrl ? (
            <a
              href={p.data.googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 no-underline hover:bg-emerald-100"
            >
              Googleカレンダーに追加
            </a>
          ) : null}
          {p.data.outlookCalendarUrl ? (
            <a
              href={p.data.outlookCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 no-underline hover:bg-emerald-100"
            >
              Outlookカレンダーに追加
            </a>
          ) : null}
          {p.data.icsContent ? (
            <button
              type="button"
              onClick={() => downloadIcs(`session-${p.data.sessionNumber ?? ""}.ics`, p.data.icsContent ?? "")}
              className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              .ics をダウンロード
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type VoteSummaryCardProps = {
  payload: unknown;
  body: string;
  onJumpToConfirm?: () => void;
};

const voteSummaryPayloadSchema = z.object({
  negotiationId: z.string().optional(),
  yesCount: z.number().optional(),
  noCount: z.number().optional(),
  allNo: z.boolean().optional(),
});

export function VoteSummaryCard({ payload, body, onJumpToConfirm }: VoteSummaryCardProps) {
  const p = voteSummaryPayloadSchema.safeParse(payload);
  const yes = p.success ? p.data.yesCount ?? 0 : 0;
  const no = p.success ? p.data.noCount ?? 0 : 0;
  const allNo = p.success ? Boolean(p.data.allNo) : false;
  return (
    <button
      type="button"
      onClick={onJumpToConfirm}
      className="w-full rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-left text-sm text-violet-950 shadow-sm ring-1 ring-violet-100 hover:bg-violet-100 active:scale-[0.99]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold tracking-wide uppercase text-violet-900">
          日程回答
        </span>
        <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          ○ {yes} 件 / × {no} 件
        </span>
      </div>
      <p className="mt-2 leading-relaxed">{body}</p>
      {!allNo ? (
        <p className="mt-2 text-xs font-medium text-violet-900/85">
          ▶ クリックで「日程調整」タブの最終確定画面へ移動します
        </p>
      ) : null}
    </button>
  );
}
