"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_AVAILABILITY_OPTIONS,
  type AvailabilitySlotOption,
} from "@/lib/availability";
import { COMPANY_PLAN_OPTIONS, DEFAULT_COMPANY_PLAN, type CompanyPlan } from "@/lib/company-plan";

type UserRow = {
  id: string;
  displayName: string;
  email: string;
  role: "ADMIN" | "ADMIN_ASSISTANT" | "PARTNER" | "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR";
  companyId?: string | null;
};

type AssignableNonAdminRole = "PARTNER" | "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR";

/** 「管理者追加」フォームで選べるロール（ADMIN / ADMIN_ASSISTANT） */
type AdminRoleChoice = "ADMIN" | "ADMIN_ASSISTANT";

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
  /** 追加時に付与するロール。デフォルトは「管理者」 */
  const [addAdminRole, setAddAdminRole] = useState<AdminRoleChoice>("ADMIN");
  const [partnerExtraQuestions, setPartnerExtraQuestions] = useState<Record<string, string[]>>({});
  // クライアント振り返り（フィードバック）の回ごと追加質問。
  // 既存 partnerExtraQuestions と同じ形（{ [sessionNumber: string]: string[] }）。
  const [clientExtraQuestions, setClientExtraQuestions] = useState<Record<string, string[]>>({});
  const [sessionGuidelines, setSessionGuidelines] = useState<
    Record<string, { client: string; partner: string }>
  >({});
  const [slotEarliestHour, setSlotEarliestHour] = useState(8);
  const [slotLatestHour, setSlotLatestHour] = useState(20);
  const [allowWeekends, setAllowWeekends] = useState(false);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string; plan: CompanyPlan }>>([]);
  /**
   * 企業（テナント）登録ロード時点のスナップショット。
   * 「使用中の企業ID を削除しようとしている」検出に使う。
   */
  const [initialCompanyIds, setInitialCompanyIds] = useState<string[]>([]);
  /** 既に user.companyId に割り当て済みの企業ID（参照のみ）。アプリ設定ロード時に集計。 */
  const [companyIdsInUse, setCompanyIdsInUse] = useState<Set<string>>(new Set());
  // 「枠・回数・TZ / 対応可能時間 / 候補日の制約 / パートナー追加質問 / セッションガイドライン」は
  // /admin/companies/[id]/settings に集約した。
  // ただし、これらの値は「企業未割当のユーザーに対するデフォルト」「新規登録時の選択肢」として
  // 引き続き必要なため、appSettings 上のデータ自体は残し、onSubmit でもそのまま再送信される。
  const [settingsSection, setSettingsSection] = useState<"companies" | "admin">("companies");

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
        const ceq = (sData.settings as Record<string, unknown>).clientExtraQuestionsByRound;
        if (ceq && typeof ceq === "object") {
          const cleaned: Record<string, string[]> = {};
          for (const [k, v] of Object.entries(ceq as Record<string, unknown>)) {
            if (Array.isArray(v)) cleaned[String(k)] = v.map((x) => String(x));
          }
          setClientExtraQuestions(cleaned);
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
              const planRaw = typeof o.plan === "string" ? o.plan : DEFAULT_COMPANY_PLAN;
              const plan =
                planRaw === "individual_companion" ||
                planRaw === "coaching_management_training" ||
                planRaw === "workplace_activation"
                  ? planRaw
                  : DEFAULT_COMPANY_PLAN;
              if (!id || !name) return null;
              return { id, name, plan };
            })
            .filter((x): x is { id: string; name: string; plan: CompanyPlan } => x !== null);
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

  /** 管理者一覧（ADMIN / ADMIN_ASSISTANT 両方を含む） */
  const adminUsers = useMemo(() => {
    const admins = users.filter((u) => u.role === "ADMIN" || u.role === "ADMIN_ASSISTANT");
    return admins.sort((a, b) => {
      if (currentUserId) {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
      }
      // ADMIN を先、ADMIN_ASSISTANT を後にまとめる
      if (a.role !== b.role) return a.role === "ADMIN" ? -1 : 1;
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

  function setCompanyField(index: number, field: "id" | "name" | "plan", value: string) {
    setCompanies((prev) => {
      const next = prev.slice();
      const cur = next[index];
      if (!cur) return prev;
      if (field === "plan") {
        const plan =
          value === "individual_companion" ||
          value === "coaching_management_training" ||
          value === "workplace_activation"
            ? value
            : DEFAULT_COMPANY_PLAN;
        next[index] = { ...cur, plan };
        return next;
      }
      const v = field === "id" ? slugifyCompanyId(value) : value;
      next[index] = { ...cur, [field]: v };
      return next;
    });
  }

  function addCompany() {
    setCompanies((prev) => {
      if (prev.length >= 64) return prev;
      const id = `company-${Date.now().toString(36)}`;
      return [...prev, { id, name: "", plan: DEFAULT_COMPANY_PLAN }];
    });
  }

  function removeCompany(index: number) {
    setCompanies((prev) => prev.filter((_, i) => i !== index));
  }

  // 旧 partner-extra-questions / session-guidelines / availability-options の
  // 編集 UI に紐付いていた小ヘルパー関数群は、このページからの編集 UI 廃止に伴い削除した。
  // 状態自体（partnerExtraQuestions / sessionGuidelines / availabilityOptions）はロード時の
  // 値を保持して onSubmit でそのまま再送信される。各企業ごとの編集は
  // /admin/companies/[id]/settings で行う。

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
    const clientExtra: Record<string, string[]> = {};
    for (const [k, list] of Object.entries(clientExtraQuestions)) {
      const trimmed = list.map((q) => q.trim()).filter((q) => q.length > 0);
      if (trimmed.length > 0) clientExtra[k] = trimmed;
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
      .map((c) => ({ id: c.id.trim(), name: c.name.trim(), plan: c.plan }))
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
        clientExtraQuestionsByRound: clientExtra,
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
      body: JSON.stringify({ userId: adminUserId, role: addAdminRole }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setErr(data?.error ?? "管理者追加に失敗しました。");
      return;
    }
    setMsg(
      addAdminRole === "ADMIN_ASSISTANT"
        ? "管理者アシスタントとして追加しました。"
        : "管理者を追加しました。",
    );
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
          このページでは「<strong>企業（テナント）の登録</strong>」と「<strong>管理者の管理</strong>」を行います。
          1on1の枠・回数・候補日の制約・追加質問・ガイドライン等は、
          <strong>企業ごとに設定する形</strong>に変わりました。
        </p>
      </header>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h2 className="text-base font-semibold text-indigo-950">
              枠・回数・候補制約・追加質問・ガイドラインの編集は「企業」ページへ
            </h2>
            <ul className="ml-5 list-disc text-sm leading-relaxed text-indigo-900/90">
              <li>1on1 枠の長さ・実施回数・タイムゾーン</li>
              <li>対応可能時間の選択肢</li>
              <li>候補日時の制約（開始/終了時刻・土日許可）</li>
              <li>パートナーレポートの追加質問</li>
              <li>各回のセッションガイドライン</li>
            </ul>
            <p className="text-xs text-indigo-900/80">
              企業ごとに値を分けて運用できます。何も上書きしなければ全体のデフォルト値が使われます。
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Link
              href="/admin/companies"
              className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm hover:bg-indigo-800"
            >
              企業ページへ →
            </Link>
          </div>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm">
        {(
          [
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
          {/*
            旧 session / availability / constraints / guidelines / partner タブの編集 UI は
            このページから廃止し、/admin/companies/[id]/settings に集約した。
            裏側では minutes / totalSessions / timezone / availabilityOptions /
            slotEarliestHour / slotLatestHour / allowWeekends / partnerExtraQuestions /
            sessionGuidelines といった state はロード時に読み込まれ、保存時にもそのまま
            再送信される。これにより「全体デフォルト」「企業未割当ユーザーへの選択肢」が
            ここを開いた管理者の保存操作で消えないよう保たれる。
          */}

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
                各企業には<strong>導入プラン</strong>を設定します。プランによってマッチルームに表示される機能が変わります。
                <br />
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
                        <select
                          value={c.plan}
                          onChange={(e) => setCompanyField(i, "plan", e.target.value)}
                          className="min-w-[12rem] rounded-md border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-sm font-semibold text-indigo-950"
                          aria-label={`${c.name || "企業"}の導入プラン`}
                        >
                          {COMPANY_PLAN_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
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

          {err ? <p className="text-sm text-red-700">{err}</p> : null}
          {msg ? <p className="text-sm text-emerald-800">{msg}</p> : null}

          <button
            type="submit"
            className="rounded-xl bg-indigo-700 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-indigo-800"
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
              <br />
              <span className="text-xs text-slate-500">
                「管理者アシスタント」は、画面の閲覧とチャットへのコメントは可能ですが、マッチ管理・アプリ設定・企業設定・請求書の確定/差戻しなど「変更／書込み」操作は行えません。
              </span>
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
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-zinc-900 break-words">{u.displayName}</p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                u.role === "ADMIN"
                                  ? "bg-indigo-100 text-indigo-900"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {u.role === "ADMIN" ? "管理者" : "管理者アシスタント"}
                            </span>
                          </div>
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
                                <option value="CLIENT_HR">CLIENT_HR</option>
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
            <p className="text-sm text-slate-600">
              既存ユーザーを「管理者（ADMIN）」または「管理者アシスタント（ADMIN_ASSISTANT）」のロールに変更します。
              管理者アシスタントは画面の閲覧・チャットへのコメントは可能ですが、マッチ管理・各種設定・請求書の確定/差戻しなど「変更／書込み」操作は行えません。
            </p>
            <label className="block space-y-2 text-sm font-medium text-slate-900">
              追加するユーザー
              <select
                value={adminUserId}
                onChange={(e) => setAdminUserId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-xs"
              >
                <option value="">選択してください</option>
                {users
                  .filter((u) => u.role !== "ADMIN" && u.role !== "ADMIN_ASSISTANT")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}（{u.email}）
                    </option>
                  ))}
              </select>
            </label>
            <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <legend className="px-1 text-sm font-semibold text-slate-900">付与するロール</legend>
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="radio"
                  name="addAdminRole"
                  value="ADMIN"
                  checked={addAdminRole === "ADMIN"}
                  onChange={() => setAddAdminRole("ADMIN")}
                  className="mt-1 h-4 w-4 accent-indigo-700"
                />
                <span>
                  <span className="font-semibold">管理者（ADMIN）</span>
                  <span className="ml-2 text-xs text-slate-600">
                    すべての画面の閲覧・編集・設定変更が可能。
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input
                  type="radio"
                  name="addAdminRole"
                  value="ADMIN_ASSISTANT"
                  checked={addAdminRole === "ADMIN_ASSISTANT"}
                  onChange={() => setAddAdminRole("ADMIN_ASSISTANT")}
                  className="mt-1 h-4 w-4 accent-amber-700"
                />
                <span>
                  <span className="font-semibold">管理者アシスタント（ADMIN_ASSISTANT）</span>
                  <span className="ml-2 text-xs text-slate-600">
                    閲覧・チャットへのコメントのみ可。マッチ管理・設定変更・請求書の確定／差戻し等の「書込み」は不可。
                  </span>
                </span>
              </label>
            </fieldset>
            <button
              type="submit"
              className={`rounded-xl border px-5 py-2.5 text-sm font-semibold shadow-sm ${
                addAdminRole === "ADMIN"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                  : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              }`}
            >
              {addAdminRole === "ADMIN" ? "管理者に追加" : "管理者アシスタントに追加"}
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
