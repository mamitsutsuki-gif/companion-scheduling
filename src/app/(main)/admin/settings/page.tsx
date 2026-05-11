"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_AVAILABILITY_OPTIONS,
  type AvailabilitySlotOption,
} from "@/lib/availability";

type UserRow = {
  id: string;
  displayName: string;
  email: string;
  role: "ADMIN" | "PARTNER" | "CLIENT" | "CLIENT_ADMIN";
  companyId?: string | null;
};

type AssignableNonAdminRole = "PARTNER" | "CLIENT" | "CLIENT_ADMIN";

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /** 管理者解除時に付与するロール（ユーザーごと） */
  const [revokeRoleByUserId, setRevokeRoleByUserId] = useState<Record<string, AssignableNonAdminRole>>({});
  const [adminActionBusy, setAdminActionBusy] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState("");
  const [partnerExtraQuestions, setPartnerExtraQuestions] = useState<Record<string, string[]>>({});
  const [sessionGuidelines, setSessionGuidelines] = useState<
    Record<string, { client: string; partner: string }>
  >({});
  const [slotEarliestHour, setSlotEarliestHour] = useState(8);
  const [slotLatestHour, setSlotLatestHour] = useState(20);
  const [allowWeekends, setAllowWeekends] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  /**
   * 企業（テナント）登録ロード時点のスナップショット。
   * 「使用中の企業ID を削除しようとしている」検出に使う。
   */
  const [initialCompanyIds, setInitialCompanyIds] = useState<string[]>([]);
  /** 既に user.companyId に割り当て済みの企業ID（参照のみ）。アプリ設定ロード時に集計。 */
  const [companyIdsInUse, setCompanyIdsInUse] = useState<Set<string>>(new Set());
  const [settingsSection, setSettingsSection] = useState<
    | "session"
    | "availability"
    | "constraints"
    | "partner"
    | "guidelines"
    | "companies"
    | "admin"
  >("session");

  // メール送信テスト用 state
  const [testMailTo, setTestMailTo] = useState("");
  const [testMailSending, setTestMailSending] = useState(false);
  const [testMailResult, setTestMailResult] = useState<string | null>(null);

  async function onSendTestMail() {
    setTestMailSending(true);
    setTestMailResult(null);
    try {
      const res = await fetch("/api/admin/test-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testMailTo.trim() ? { to: testMailTo.trim() } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setTestMailResult(`❌ ${json?.error ?? "送信に失敗しました。"}`);
      } else if (json?.ok) {
        setTestMailResult(
          `✅ 送信OK → ${json.sentTo}（ドライバ: ${json.driver}、from: ${json.from}）\n受信箱と迷惑メールフォルダの両方を確認してください。`,
        );
      } else {
        const lines: string[] = [];
        lines.push(`⚠️ 送信失敗（ドライバ: ${json?.driver ?? "?"}）`);
        if (json?.from) lines.push(`送信元: ${json.from}`);
        if (typeof json?.resendStatus === "number")
          lines.push(`Resend HTTP ステータス: ${json.resendStatus}`);
        if (json?.resendBody) {
          const bodyStr =
            typeof json.resendBody === "string"
              ? json.resendBody
              : JSON.stringify(json.resendBody, null, 2);
          lines.push("Resend のレスポンス本体:");
          lines.push(bodyStr);
        }
        if (json?.hint) {
          lines.push("");
          lines.push(`💡 ${json.hint}`);
        }
        setTestMailResult(lines.join("\n"));
      }
    } catch (e) {
      setTestMailResult(`❌ ネットワーク／通信エラー: ${String(e)}`);
    } finally {
      setTestMailSending(false);
    }
  }

  const reloadUsers = useCallback(async () => {
    const uRes = await fetch("/api/admin/users");
    const uData = await uRes.json().catch(() => null);
    if (!uRes.ok) {
      setErr(uData?.error ?? "ユーザー一覧の再取得に失敗しました。");
      return false;
    }
    const userList: UserRow[] = Array.isArray(uData?.users) ? uData.users : [];
    setUsers(userList);
    const used = new Set<string>();
    for (const u of userList) {
      const cid = (u.companyId ?? "").trim();
      if (cid) used.add(cid);
    }
    setCompanyIdsInUse(used);
    return true;
  }, []);

  useEffect(() => {
    async function load() {
      const [sRes, uRes, meRes] = await Promise.all([
        fetch("/api/admin/app-settings"),
        fetch("/api/admin/users"),
        fetch("/api/me", { cache: "no-store" }),
      ]);
      const sData = await sRes.json().catch(() => null);
      const uData = await uRes.json().catch(() => null);
      const meData = await meRes.json().catch(() => null);
      if (meRes.ok && meData?.user?.id) {
        setCurrentUserId(String(meData.user.id));
      }
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
        const sg = sData.settings.sessionGuidelinesByRound;
        if (sg && typeof sg === "object") {
          const cleaned: Record<string, { client: string; partner: string }> = {};
          for (const [k, v] of Object.entries(sg)) {
            if (v && typeof v === "object") {
              const obj = v as Record<string, unknown>;
              cleaned[String(k)] = {
                client: typeof obj.client === "string" ? obj.client : "",
                partner: typeof obj.partner === "string" ? obj.partner : "",
              };
            }
          }
          setSessionGuidelines(cleaned);
        }
        if (typeof sData.settings.slotEarliestHour === "number") setSlotEarliestHour(sData.settings.slotEarliestHour);
        if (typeof sData.settings.slotLatestHour === "number") setSlotLatestHour(sData.settings.slotLatestHour);
        if (typeof sData.settings.allowWeekends === "boolean") setAllowWeekends(sData.settings.allowWeekends);
        if (Array.isArray(sData.settings.companies)) {
          const list = (sData.settings.companies as unknown[])
            .map((v) => {
              if (!v || typeof v !== "object") return null;
              const o = v as Record<string, unknown>;
              const id = typeof o.id === "string" ? o.id : "";
              const name = typeof o.name === "string" ? o.name : "";
              if (!id || !name) return null;
              return { id, name };
            })
            .filter((x): x is { id: string; name: string } => x !== null);
          setCompanies(list);
          setInitialCompanyIds(list.map((c) => c.id));
        }
      }
      const userList: UserRow[] = Array.isArray(uData?.users) ? uData.users : [];
      setUsers(userList);
      const used = new Set<string>();
      for (const u of userList) {
        const cid = (u.companyId ?? "").trim();
        if (cid) used.add(cid);
      }
      setCompanyIdsInUse(used);
      setLoading(false);
    }
    void load();
  }, []);

  const adminUsers = useMemo(() => {
    const admins = users.filter((u) => u.role === "ADMIN");
    return admins.sort((a, b) => {
      if (currentUserId) {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
      }
      return a.displayName.localeCompare(b.displayName, "ja");
    });
  }, [users, currentUserId]);

  function slugifyCompanyId(input: string) {
    return input
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60);
  }

  function setCompanyField(index: number, field: "id" | "name", value: string) {
    setCompanies((prev) => {
      const next = prev.slice();
      const cur = next[index];
      if (!cur) return prev;
      const v = field === "id" ? slugifyCompanyId(value) : value;
      next[index] = { ...cur, [field]: v };
      return next;
    });
  }

  function addCompany() {
    setCompanies((prev) => {
      if (prev.length >= 64) return prev;
      const id = `company-${Date.now().toString(36)}`;
      return [...prev, { id, name: "" }];
    });
  }

  function removeCompany(index: number) {
    setCompanies((prev) => prev.filter((_, i) => i !== index));
  }

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

  function setGuidelineField(round: number, who: "client" | "partner", text: string) {
    setSessionGuidelines((prev) => {
      const key = String(round);
      const cur = prev[key] ?? { client: "", partner: "" };
      return { ...prev, [key]: { ...cur, [who]: text } };
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
    const guidelines: Record<string, { client: string; partner: string }> = {};
    for (const [k, v] of Object.entries(sessionGuidelines)) {
      const client = (v.client ?? "").trim();
      const partner = (v.partner ?? "").trim();
      if (client.length === 0 && partner.length === 0) continue;
      guidelines[k] = { client, partner };
    }
    const cleanedCompanies = companies
      .map((c) => ({ id: c.id.trim(), name: c.name.trim() }))
      .filter((c) => c.id && c.name);
    {
      const cIds = cleanedCompanies.map((c) => c.id);
      if (new Set(cIds).size !== cIds.length) {
        setErr("企業IDが重複しています。重複しない英数IDを入力してください。");
        return;
      }
    }
    // 使用中の企業ID を削除しようとしている場合は安全側で停止
    const beforeIds = new Set(initialCompanyIds);
    const afterIds = new Set(cleanedCompanies.map((c) => c.id));
    const removedInUse: string[] = [];
    for (const id of beforeIds) {
      if (!afterIds.has(id) && companyIdsInUse.has(id)) removedInUse.push(id);
    }
    if (removedInUse.length > 0) {
      setErr(
        `次の企業ID は割り当て済みのユーザーがいます。先にユーザーの所属を変更してから削除してください: ${removedInUse.join(", ")}`,
      );
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
        sessionGuidelinesByRound: guidelines,
        slotEarliestHour: Number(slotEarliestHour),
        slotLatestHour: Number(slotLatestHour),
        allowWeekends,
        companies: cleanedCompanies,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error ?? "保存に失敗しました。");
      return;
    }
    setMsg("保存しました。新規登録のクライアントは新しい選択肢を選べます。");
    setInitialCompanyIds(cleanedCompanies.map((c) => c.id));
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
    await reloadUsers();
  }

  async function onRevokeAdmin(userId: string) {
    const newRole = revokeRoleByUserId[userId] ?? "CLIENT";
    setMsg(null);
    setErr(null);
    const ok = window.confirm(
      `このユーザーの管理者権限を外し、ロールを「${newRole}」に変更しますか？`,
    );
    if (!ok) return;
    setAdminActionBusy(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? "管理者の解除に失敗しました。");
        return;
      }
      setMsg("管理者権限を解除しました。");
      await reloadUsers();
    } finally {
      setAdminActionBusy(null);
    }
  }

  async function onDeleteAdminUser(userId: string, displayName: string) {
    setMsg(null);
    setErr(null);
    const ok = window.confirm(
      `本当に ${displayName} のアカウントを削除しますか？\n\n` +
        `このアカウントはアプリから完全に削除され、以降ログインできなくなります。\n` +
        `同じメールアドレスでの再利用には、Firebase Authentication 側の整理や新規登録が必要になる場合があります。`,
    );
    if (!ok) return;
    setAdminActionBusy(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? "アカウント削除に失敗しました。");
        return;
      }
      setMsg("ユーザーを削除しました。");
      await reloadUsers();
    } finally {
      setAdminActionBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">読込中…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">Administrator</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">アプリ設定</h1>
        <p className="mt-3 text-sm text-slate-600">
          日程候補の「終了時刻」はここで指定した分だけ開始から自動計算されます。パートナーは開始のみ選びます。
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm">
        {(
          [
            ["session", "枠・回数・TZ"],
            ["availability", "対応可能時間"],
            ["constraints", "候補日の制約"],
            ["partner", "パートナー追加質問"],
            ["guidelines", "セッションガイドライン"],
            ["companies", "企業（テナント）"],
            ["admin", "管理者"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSettingsSection(id)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              settingsSection === id
                ? "bg-indigo-700 text-white shadow-sm"
                : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {settingsSection !== "admin" ? (
        <form
          className="space-y-6 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8"
          onSubmit={onSubmit}
        >
          {settingsSection === "session" ? (
            <>
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
            </>
          ) : null}

          {settingsSection === "availability" ? (
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
          ) : null}

          {settingsSection === "constraints" ? (
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
          ) : null}

          {settingsSection === "guidelines" ? (
            <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
              <div>
                <h3 className="text-base font-semibold text-violet-950">各回のセッションガイドライン</h3>
                <p className="mt-1 text-sm text-violet-900/80">
                  クライアント・パートナーそれぞれに向けたガイドラインを、1on1の回ごとに設定できます。空欄の回は詳細ページでも非表示になります。
                </p>
              </div>
              <div className="space-y-3">
                {Array.from({ length: Math.max(1, totalSessions) }, (_, i) => i + 1).map((round) => {
                  const cur = sessionGuidelines[String(round)] ?? { client: "", partner: "" };
                  const filled = (cur.client?.trim().length ?? 0) + (cur.partner?.trim().length ?? 0) > 0;
                  return (
                    <details
                      key={round}
                      className="rounded-md border border-violet-200 bg-white px-3 py-2"
                      open={filled}
                    >
                      <summary className="cursor-pointer text-sm font-semibold text-violet-900">
                        {round} 回目 のガイドライン{filled ? "（設定あり）" : ""}
                      </summary>
                      <div className="mt-2 space-y-3">
                        <label className="block space-y-1 text-sm font-medium text-zinc-900">
                          クライアント向けガイドライン
                          <textarea
                            value={cur.client}
                            onChange={(e) => setGuidelineField(round, "client", e.target.value)}
                            rows={4}
                            maxLength={4000}
                            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                            placeholder="例: 今回は『1on1に期待すること』を持ち寄ってください。"
                          />
                        </label>
                        <label className="block space-y-1 text-sm font-medium text-zinc-900">
                          パートナー向けガイドライン
                          <textarea
                            value={cur.partner}
                            onChange={(e) => setGuidelineField(round, "partner", e.target.value)}
                            rows={4}
                            maxLength={4000}
                            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
                            placeholder="例: 初回は信頼関係づくりを最優先に。質問は7:3の傾聴比率で。"
                          />
                        </label>
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ) : null}

          {settingsSection === "companies" ? (
            <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-semibold text-rose-950">企業（テナント）の登録</h3>
                <button
                  type="button"
                  onClick={addCompany}
                  disabled={companies.length >= 64}
                  className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-900 hover:bg-rose-50 disabled:opacity-50"
                >
                  企業を追加
                </button>
              </div>
              <p className="text-sm text-rose-900/80">
                クライアント／クライアント管理者の「所属企業ID」はここに登録された企業からのみ選べます。<br />
                <strong>同じ企業のクライアント同士だけ</strong>が「自分FTA」をお互いに閲覧でき、
                <strong>同じ企業のクライアントの日程一覧</strong>のみクライアント管理者が見られます。
                別企業間のデータは絶対に交わりません。
              </p>
              <p className="text-xs text-rose-900/70">
                ※ 企業ID（半角英数・ハイフン・アンダースコア）は内部キーです。後から変更すると割り当て済みユーザーとの紐づけが切れるので、原則は新規追加と未使用 ID の削除のみで運用してください。
              </p>
              {companies.length === 0 ? (
                <p className="rounded-md border border-dashed border-rose-300 bg-white px-3 py-3 text-sm text-rose-900/80">
                  まだ企業が登録されていません。「企業を追加」から登録してください。
                </p>
              ) : (
                <ul className="space-y-2">
                  {companies.map((c, i) => {
                    const inUse = companyIdsInUse.has(c.id);
                    return (
                      <li
                        key={i}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2"
                      >
                        <input
                          value={c.name}
                          onChange={(e) => setCompanyField(i, "name", e.target.value)}
                          placeholder="企業名（例: 株式会社モチベイジ）"
                          maxLength={80}
                          className="flex-1 min-w-[14rem] rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950"
                        />
                        <input
                          value={c.id}
                          onChange={(e) => setCompanyField(i, "id", e.target.value)}
                          placeholder="企業ID（例: motive-iji）"
                          maxLength={60}
                          className="w-52 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-700"
                        />
                        {inUse ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                            割当ユーザーあり
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removeCompany(i)}
                          disabled={inUse}
                          title={inUse ? "割当ユーザーがいるため削除できません" : ""}
                          className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          削除
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {settingsSection === "partner" ? (
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
          ) : null}

          {err ? <p className="text-sm text-red-700">{err}</p> : null}
          {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}

          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            保存
          </button>
        </form>
      ) : null}

      {settingsSection === "admin" ? (
        <div className="space-y-6">
          {err ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
          {msg ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>
          ) : null}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8">
            <h2 className="text-lg font-semibold text-slate-900">現在の管理者</h2>
            <p className="mt-2 text-sm text-slate-600">
              ログイン中のアカウントは自分で管理者権限を外せません。他の管理者が 2 人以上いるときだけ、他者の権限解除やアカウント削除ができます。
              システム上、管理者が 0 人になる操作（最後の管理者の解除・削除）はできません。
            </p>
            {currentUserId === null ? (
              <p className="mt-3 text-xs text-amber-800">
                ログイン中のアカウント情報を取得できませんでした。再読み込みするか、しばらくしてから再度お試しください。
              </p>
            ) : null}
            {adminUsers.length === 0 ? (
              <p className="mt-4 text-sm text-amber-800">管理者が登録されていません。下のフォームからユーザーを追加してください。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {adminUsers.map((u) => {
                  const isSelf = currentUserId !== null && u.id === currentUserId;
                  const canModifyOthers = currentUserId !== null && adminUsers.length >= 2 && !isSelf;
                  const busy = adminActionBusy === u.id;
                  const revokeRole = revokeRoleByUserId[u.id] ?? "CLIENT";
                  return (
                    <li
                      key={u.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 shadow-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-zinc-900 break-words">{u.displayName}</p>
                          <p className="text-xs text-zinc-600 break-all">{u.email}</p>
                          {isSelf ? (
                            <p className="mt-1 text-xs font-medium text-indigo-800">ログイン中のあなた</p>
                          ) : null}
                        </div>
                        {canModifyOthers ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-xs text-slate-700">
                              <span className="whitespace-nowrap">解除後のロール</span>
                              <select
                                value={revokeRole}
                                disabled={busy}
                                onChange={(e) =>
                                  setRevokeRoleByUserId((prev) => ({
                                    ...prev,
                                    [u.id]: e.target.value as AssignableNonAdminRole,
                                  }))
                                }
                                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                              >
                                <option value="CLIENT">CLIENT</option>
                                <option value="CLIENT_ADMIN">CLIENT_ADMIN</option>
                                <option value="PARTNER">PARTNER</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onRevokeAdmin(u.id)}
                              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {busy ? "処理中…" : "管理者を解除"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onDeleteAdminUser(u.id, u.displayName)}
                              className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                            >
                              アカウント削除
                            </button>
                          </div>
                        ) : isSelf ? (
                          <p className="max-w-xs text-xs text-slate-500">
                            自分の管理者権限はここからは外せません。別の管理者に依頼するか、別アカウントを先に管理者にしてください。
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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

          <section className="space-y-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">メール送信テスト</h2>
              <p className="mt-1 text-sm text-slate-600">
                本番でメールが届くかを確認するためのテスト送信です。Resend
                の送信ドメイン認証や環境変数（<code>RESEND_API_KEY</code> /
                <code>SMTP_FROM</code> / <code>APP_ORIGIN</code>）が正しく設定されているかを検証します。
                空欄の場合はログイン中の管理者のメールアドレス宛てに送信されます。
              </p>
            </div>
            <label className="block space-y-2 text-sm font-medium text-slate-900">
              送信先（省略すると自分宛）
              <input
                type="email"
                value={testMailTo}
                onChange={(e) => setTestMailTo(e.target.value)}
                placeholder="例: customer@motive-iji.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
              />
            </label>
            <button
              type="button"
              onClick={() => void onSendTestMail()}
              disabled={testMailSending}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
            >
              {testMailSending ? "送信中…" : "テストメールを送信"}
            </button>
            {testMailResult ? (
              <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {testMailResult}
              </pre>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
