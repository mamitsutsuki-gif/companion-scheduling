"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  DEFAULT_AVAILABILITY_OPTIONS,
  type AvailabilitySlotOption,
} from "@/lib/availability";

type UserRow = {
  id: string;
  displayName: string;
  email: string;
  role: "ADMIN" | "PARTNER" | "CLIENT";
};

function slugify(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

export default function AdminAppSettingsPage() {
  const [minutes, setMinutes] = useState(30);
  const [totalSessions, setTotalSessions] = useState(6);
  const [timezone, setTimezone] = useState("Asia/Tokyo");
  const [availabilityOptions, setAvailabilityOptions] = useState<AvailabilitySlotOption[]>(
    DEFAULT_AVAILABILITY_OPTIONS,
  );
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [adminUserId, setAdminUserId] = useState("");
  const [partnerExtraQuestions, setPartnerExtraQuestions] = useState<Record<string, string[]>>({});
  const [slotEarliestHour, setSlotEarliestHour] = useState(8);
  const [slotLatestHour, setSlotLatestHour] = useState(20);
  const [allowWeekends, setAllowWeekends] = useState(false);

  useEffect(() => {
    async function load() {
      const [sRes, uRes] = await Promise.all([
        fetch("/api/admin/app-settings"),
        fetch("/api/admin/users"),
      ]);
      const sData = await sRes.json().catch(() => null);
      const uData = await uRes.json().catch(() => null);
      if (!sRes.ok) {
        setErr(sData?.error ?? "読込に失敗しました。");
        setLoading(false);
        return;
      }
      if (!uRes.ok) {
        setErr(uData?.error ?? "ユーザー一覧の取得に失敗しました。");
        setLoading(false);
        return;
      }
      if (sData?.settings) {
        setMinutes(sData.settings.slotDurationMinutes);
        setTotalSessions(typeof sData.settings.totalSessions === "number" ? sData.settings.totalSessions : 6);
        setTimezone(sData.settings.timezone);
        if (Array.isArray(sData.settings.availabilitySlotOptions) && sData.settings.availabilitySlotOptions.length > 0) {
          setAvailabilityOptions(sData.settings.availabilitySlotOptions);
        }
        const peq = sData.settings.partnerExtraQuestionsByRound;
        if (peq && typeof peq === "object") {
          const cleaned: Record<string, string[]> = {};
          for (const [k, v] of Object.entries(peq)) {
            if (Array.isArray(v)) cleaned[String(k)] = v.map((x) => String(x));
          }
          setPartnerExtraQuestions(cleaned);
        }
        if (typeof sData.settings.slotEarliestHour === "number") setSlotEarliestHour(sData.settings.slotEarliestHour);
        if (typeof sData.settings.slotLatestHour === "number") setSlotLatestHour(sData.settings.slotLatestHour);
        if (typeof sData.settings.allowWeekends === "boolean") setAllowWeekends(sData.settings.allowWeekends);
      }
      setUsers(Array.isArray(uData?.users) ? uData.users : []);
      setLoading(false);
    }
    void load();
  }, []);

  function setQuestionForRound(round: number, index: number, text: string) {
    setPartnerExtraQuestions((prev) => {
      const key = String(round);
      const list = (prev[key] ?? []).slice();
      list[index] = text;
      return { ...prev, [key]: list };
    });
  }
  function addQuestionToRound(round: number) {
    setPartnerExtraQuestions((prev) => {
      const key = String(round);
      const list = (prev[key] ?? []).slice();
      if (list.length >= 8) return prev;
      list.push("");
      return { ...prev, [key]: list };
    });
  }
  function removeQuestionFromRound(round: number, index: number) {
    setPartnerExtraQuestions((prev) => {
      const key = String(round);
      const list = (prev[key] ?? []).slice();
      list.splice(index, 1);
      return { ...prev, [key]: list };
    });
  }

  function updateAvailabilityLabel(index: number, label: string) {
    setAvailabilityOptions((prev) => {
      const next = prev.slice();
      const cur = next[index];
      if (!cur) return prev;
      next[index] = { ...cur, label };
      return next;
    });
  }

  function updateAvailabilityId(index: number, id: string) {
    setAvailabilityOptions((prev) => {
      const next = prev.slice();
      const cur = next[index];
      if (!cur) return prev;
      next[index] = { ...cur, id: slugify(id) };
      return next;
    });
  }

  function addAvailabilityOption() {
    setAvailabilityOptions((prev) => {
      if (prev.length >= 32) return prev;
      const id = `slot-${Date.now().toString(36)}`;
      return [...prev, { id, label: "" }];
    });
  }

  function removeAvailabilityOption(index: number) {
    setAvailabilityOptions((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const cleaned = availabilityOptions
      .map((o) => ({ id: o.id.trim(), label: o.label.trim() }))
      .filter((o) => o.id && o.label);
    if (cleaned.length === 0) {
      setErr("対応可能時間の選択肢を1件以上入力してください。");
      return;
    }
    const ids = cleaned.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      setErr("対応可能時間のIDが重複しています。");
      return;
    }
    const partnerExtra: Record<string, string[]> = {};
    for (const [k, list] of Object.entries(partnerExtraQuestions)) {
      const trimmed = list.map((q) => q.trim()).filter((q) => q.length > 0);
      if (trimmed.length > 0) partnerExtra[k] = trimmed;
    }

    if (slotEarliestHour >= slotLatestHour) {
      setErr("候補時間帯の開始時刻は終了時刻より前にしてください。");
      return;
    }
    const res = await fetch("/api/admin/app-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotDurationMinutes: Number(minutes),
        totalSessions: Number(totalSessions),
        timezone,
        availabilitySlotOptions: cleaned,
        partnerExtraQuestionsByRound: partnerExtra,
        slotEarliestHour: Number(slotEarliestHour),
        slotLatestHour: Number(slotLatestHour),
        allowWeekends,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error ?? "保存に失敗しました。");
      return;
    }
    setMsg("保存しました。新規登録のクライアントは新しい選択肢を選べます。");
  }

  async function onAddAdmin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (!adminUserId) return setErr("管理者にするユーザーを選択してください。");

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: adminUserId, role: "ADMIN" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error ?? "管理者追加に失敗しました。");
      return;
    }
    setMsg("管理者を追加しました。");
    setAdminUserId("");
    const uRes = await fetch("/api/admin/users");
    const uData = await uRes.json().catch(() => null);
    if (uRes.ok) setUsers(Array.isArray(uData?.users) ? uData.users : []);
  }

  if (loading) {
    return <p className="text-sm text-slate-600">読込中…</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Administrator</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">アプリ設定</h1>
        <p className="mt-3 text-sm text-slate-600">
          日程候補の「終了時刻」はここで指定した分だけ開始から自動計算されます。パートナーは開始のみ選びます。
        </p>
      </header>

      <form
        className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8"
        onSubmit={onSubmit}
      >
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          ミーティング枠の長さ（分）
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
          >
            {[15, 20, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} 分枠
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2 text-sm font-medium text-slate-900">
          今回プロジェクトで実施する1on1回数
          <select
            value={totalSessions}
            onChange={(e) => setTotalSessions(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((count) => (
              <option key={count} value={count}>
                全 {count} 回
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2 text-sm font-medium text-slate-900">
          表示・案内で使うタイムゾーン（IANA）
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 shadow-xs"
            placeholder="Asia/Tokyo"
          />
          <span className="block text-xs font-normal text-slate-500">
            ログやメール内の説明テキスト用です。参加者の入力はブラウザのローカル時刻のまま扱われます。
          </span>
        </label>

        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-emerald-950">対応可能時間の選択肢</h3>
            <button
              type="button"
              onClick={addAvailabilityOption}
              disabled={availabilityOptions.length >= 32}
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
            >
              選択肢を追加
            </button>
          </div>
          <p className="text-sm text-emerald-900/80">
            登録時にクライアントが選択する候補です。例：「平日 9:00〜12:00」を「9:00〜12:00」「12:00〜15:00」のように分けることも可能です。
          </p>
          <ul className="space-y-2">
            {availabilityOptions.map((opt, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2">
                <input
                  value={opt.label}
                  onChange={(e) => updateAvailabilityLabel(i, e.target.value)}
                  placeholder="表示ラベル（例: 平日 9:00〜12:00）"
                  className="flex-1 min-w-[12rem] rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950"
                />
                <input
                  value={opt.id}
                  onChange={(e) => updateAvailabilityId(i, e.target.value)}
                  placeholder="ID（半角英数）"
                  className="w-44 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-700"
                />
                <button
                  type="button"
                  onClick={() => removeAvailabilityOption(i)}
                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-emerald-900/70">
            ※ IDを変更すると、既存ユーザーの選択は新IDへ自動マッピングされません。基本は新規追加・削除で運用してください。
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-4">
          <div>
            <h3 className="text-base font-semibold text-sky-950">パートナーが提案できる候補日時の制約</h3>
            <p className="mt-1 text-sm text-sky-900/80">
              候補日時の入力フォームで選択可能な時間帯を制限します。デフォルトは平日 8:00〜20:00。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium text-sky-950">
              開始時刻（時）
              <select
                value={slotEarliestHour}
                onChange={(e) => setSlotEarliestHour(Number(e.target.value))}
                className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sky-950"
              >
                {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm font-medium text-sky-950">
              終了時刻（時）
              <select
                value={slotLatestHour}
                onChange={(e) => setSlotLatestHour(Number(e.target.value))}
                className="w-full rounded-md border border-sky-200 bg-white px-3 py-2 text-sky-950"
              >
                {Array.from({ length: 25 }, (_, h) => h).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-sky-950">
            <input
              type="checkbox"
              checked={allowWeekends}
              onChange={(e) => setAllowWeekends(e.target.checked)}
              className="h-4 w-4"
            />
            土日も候補日として選択可能にする
          </label>
        </div>

        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div>
            <h3 className="text-base font-semibold text-amber-950">パートナーレポートの追加質問</h3>
            <p className="mt-1 text-sm text-amber-900/80">
              特定の回（例: 4回目、8回目）でだけ、パートナーが書くレポートに追加で表示する質問を設定できます。
            </p>
            <p className="mt-1 text-xs text-amber-900/70">
              空欄で保存するとその回の追加質問は削除されます。
            </p>
          </div>
          <div className="space-y-3">
            {Array.from({ length: Math.max(1, totalSessions) }, (_, i) => i + 1).map((round) => {
              const list = partnerExtraQuestions[String(round)] ?? [];
              return (
                <details
                  key={round}
                  className="rounded-md border border-amber-200 bg-white px-3 py-2"
                  open={list.length > 0}
                >
                  <summary className="cursor-pointer text-sm font-semibold text-amber-900">
                    {round} 回目 の追加質問{list.length > 0 ? `（${list.length}件）` : ""}
                  </summary>
                  <div className="mt-2 space-y-2">
                    {list.length === 0 ? (
                      <p className="text-xs text-zinc-500">追加質問はありません。</p>
                    ) : null}
                    {list.map((q, i) => (
                      <div key={i} className="flex gap-2">
                        <textarea
                          value={q}
                          onChange={(e) => setQuestionForRound(round, i, e.target.value)}
                          rows={2}
                          maxLength={500}
                          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                          placeholder="例: ここまで担当いただいて感じるクライアントの強み・課題は何ですか？"
                        />
                        <button
                          type="button"
                          onClick={() => removeQuestionFromRound(round, i)}
                          className="self-start rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addQuestionToRound(round)}
                      disabled={list.length >= 8}
                      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      質問を追加
                    </button>
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        {err ? <p className="text-sm text-red-700">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}

        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          保存
        </button>
      </form>

      <form
        className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8"
        onSubmit={onAddAdmin}
      >
        <h2 className="text-lg font-semibold text-slate-900">管理者の追加</h2>
        <p className="text-sm text-slate-600">既存ユーザーを管理者ロール（ADMIN）に変更します。</p>
        <label className="block space-y-2 text-sm font-medium text-slate-900">
          追加するユーザー
          <select
            value={adminUserId}
            onChange={(e) => setAdminUserId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
          >
            <option value="">選択してください</option>
            {users.filter((u) => u.role !== "ADMIN").map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}（{u.email}）
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-xl border border-indigo-300 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm hover:bg-indigo-100"
        >
          管理者に追加
        </button>
      </form>
    </div>
  );
}
