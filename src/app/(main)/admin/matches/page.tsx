"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_AVAILABILITY_OPTIONS,
  labelsForSlotIds,
  type AvailabilitySlotOption,
} from "@/lib/availability";

type RoleUser = {
  id: string;
  displayName: string;
  role: "ADMIN" | "ADMIN_ASSISTANT" | "PARTNER" | "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR";
  email: string;
  firebaseUid?: string | null;
  companyId?: string | null;
  availabilitySlotIds?: string[];
};

type AssignableRole = "PARTNER" | "CLIENT" | "CLIENT_ADMIN" | "CLIENT_HR";

type MatchRow = {
  id: string;
  createdAt: string;
  partner: { id: string; displayName: string; email: string };
  client: {
    id: string;
    displayName: string;
    email: string;
    companyId?: string | null;
    companyName?: string | null;
  };
};

function formatJa(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function withHonorificSan(name: string) {
  return `${name}さん`;
}

export default function AdminMatchesPage() {
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [partnerFilter, setPartnerFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);

  // 通知から `/admin/matches?focus=<matchId>` で遷移してきた場合に、
  // 該当行をスクロール＆一時的にハイライトする。
  const searchParams = useSearchParams();
  const focusMatchId = searchParams?.get("focus") ?? null;
  const [focusedMatchId, setFocusedMatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [availabilityOptions, setAvailabilityOptions] = useState<AvailabilitySlotOption[]>(
    DEFAULT_AVAILABILITY_OPTIONS,
  );
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  // マッチ一覧を「企業で絞り込み」する。"" = 全企業 / "__none__" = 企業未割当のクライアントのみ
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [editingAvailabilityUserId, setEditingAvailabilityUserId] = useState<string | null>(null);
  const [editingSelections, setEditingSelections] = useState<string[]>([]);
  const [editingNameUserId, setEditingNameUserId] = useState<string | null>(null);
  const [editingNameDraft, setEditingNameDraft] = useState("");
  /** 所属企業の編集中ユーザーと、選択ドラフト（未保存値）。スコープ漏れ防止のため明示的な編集モードに。 */
  const [editingCompanyUserId, setEditingCompanyUserId] = useState<string | null>(null);
  const [editingCompanyDraft, setEditingCompanyDraft] = useState<string>("");
  const [companySavingUserId, setCompanySavingUserId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<string | null>(null);

  // URL の ?company= を初期値として反映（ブラウザのみ）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("company");
    if (q) setCompanyFilter(q);
  }, []);

  useEffect(() => {
    void fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setViewerRole(typeof j?.user?.role === "string" ? j.user.role : null))
      .catch(() => setViewerRole(null));
  }, []);

  const reloadAll = useCallback(async () => {
    setError(null);
    setLoading(true);
    const [uRes, mRes, sRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/matches"),
      // 管理者専用のアプリ設定を取得（公開 /api/settings ではなく、admin endpoint）。
      // 企業（テナント）登録は機密寄りなので公開エンドポイントには載せない。
      fetch("/api/admin/app-settings"),
    ]);
    const uJson = await uRes.json().catch(() => null);
    const mJson = await mRes.json().catch(() => null);
    const sJson = await sRes.json().catch(() => null);

    if (!uRes.ok) {
      setError(uJson?.error ?? "ユーザー一覧の取得に失敗しました。");
      setLoading(false);
      return;
    }
    if (!mRes.ok) {
      setError(mJson?.error ?? "マッチ一覧の取得に失敗しました。");
      setLoading(false);
      return;
    }

    setUsers(Array.isArray(uJson.users) ? uJson.users : []);
    setMatches(Array.isArray(mJson.matches) ? mJson.matches : []);
    if (sRes.ok && sJson?.settings) {
      if (
        Array.isArray(sJson.settings.availabilitySlotOptions) &&
        sJson.settings.availabilitySlotOptions.length > 0
      ) {
        setAvailabilityOptions(sJson.settings.availabilitySlotOptions);
      }
      if (Array.isArray(sJson.settings.companies)) {
        const list = (sJson.settings.companies as unknown[])
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
      }
    }
    setSelectedMatchIds([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reloadAll();
  }, [reloadAll]);

  const partners = users.filter((u) => u.role === "PARTNER");
  // クライアント管理者も「クライアント」として通常通りマッチング対象になる
  const clients = users.filter(
    (u) => u.role === "CLIENT" || u.role === "CLIENT_ADMIN" || u.role === "CLIENT_HR",
  );

  const filteredPartners = useMemo(() => {
    const q = partnerFilter.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q),
    );
  }, [partners, partnerFilter]);

  const filteredClients = useMemo(() => {
    const q = clientFilter.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [clients, clientFilter]);

  /** マッチ一覧（クライアント所属企業で絞り込み） */
  const filteredMatches = useMemo(() => {
    if (!companyFilter) return matches;
    if (companyFilter === "__none__") {
      return matches.filter((m) => !((m.client.companyId ?? "").trim()));
    }
    return matches.filter((m) => (m.client.companyId ?? "") === companyFilter);
  }, [matches, companyFilter]);

  // `?focus=<matchId>` で指定された行があれば、企業フィルタを「すべて」に戻し
  // （絞り込みでヒットせず行が無いと意味が無いので）、行へスクロールしてハイライト。
  useEffect(() => {
    if (!focusMatchId) return;
    if (matches.length === 0) return;
    const target = matches.find((m) => m.id === focusMatchId);
    if (!target) return;
    if (
      companyFilter &&
      companyFilter !== (target.client.companyId ?? "") &&
      !(companyFilter === "__none__" && !((target.client.companyId ?? "").trim()))
    ) {
      setCompanyFilter("");
    }
    setFocusedMatchId(focusMatchId);
    // DOM の更新後にスクロール（次フレーム以降に reflow させる）。
    const t = window.setTimeout(() => {
      const el = document.getElementById(`match-row-${focusMatchId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    // 2.5 秒でハイライトを自動解除（同じ行を再度ハイライトできるよう）。
    const clear = window.setTimeout(() => setFocusedMatchId(null), 2500);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(clear);
    };
  }, [focusMatchId, matches, companyFilter]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    /** `await` 後は `currentTarget` が null になり得る（React の合成イベント） */
    const form = e.currentTarget;
    setMessage(null);
    setError(null);
    const fd = new FormData(form);
    const res = await fetch("/api/admin/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnerId: fd.get("partnerId"),
        clientId: fd.get("clientId"),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "作成に失敗しました。");
      return;
    }
    setMessage("マッチを登録しました。一覧を更新しました。");
    form.reset();
    void reloadAll();
  }

  async function onRoleChange(userId: string, role: AssignableRole) {
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "ロール変更に失敗しました。");
      return;
    }
    setMessage("ロールを更新しました。");
    void reloadAll();
  }

  function startEditingCompany(u: RoleUser) {
    setEditingCompanyUserId(u.id);
    setEditingCompanyDraft((u.companyId ?? "").trim());
    setError(null);
  }

  function cancelEditingCompany() {
    setEditingCompanyUserId(null);
    setEditingCompanyDraft("");
  }

  async function saveCompanyAssignment(u: RoleUser) {
    const currentId = (u.companyId ?? "").trim();
    const nextId = editingCompanyDraft.trim();
    if (nextId === currentId) {
      cancelEditingCompany();
      return;
    }

    const currentName = currentId
      ? companies.find((c) => c.id === currentId)?.name ?? `未登録ID: ${currentId}`
      : "未所属";
    const nextName = nextId
      ? companies.find((c) => c.id === nextId)?.name ?? `未登録ID: ${nextId}`
      : "未所属";

    const ok = window.confirm(
      `${withHonorificSan(u.displayName)} の所属企業を変更しますか？\n\n` +
        `変更前: ${currentName}\n` +
        `変更後: ${nextName}\n\n` +
        `※ 企業に紐づく設定（枠の長さ・対応可能時間など）と、` +
        `同じ企業内のクライアント管理者の閲覧範囲がこの設定に従います。`,
    );
    if (!ok) return;

    setError(null);
    setMessage(null);
    setCompanySavingUserId(u.id);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, companyId: nextId || null }),
    });
    const data = await res.json().catch(() => null);
    setCompanySavingUserId(null);
    if (!res.ok) {
      setError(data?.error ?? "所属企業の更新に失敗しました。");
      return;
    }
    setMessage(`${withHonorificSan(u.displayName)} の所属企業を「${nextName}」に変更しました。`);
    cancelEditingCompany();
    void reloadAll();
  }

  function startEditingAvailability(user: RoleUser) {
    setEditingAvailabilityUserId(user.id);
    setEditingSelections([...(user.availabilitySlotIds ?? [])]);
  }

  function cancelEditingAvailability() {
    setEditingAvailabilityUserId(null);
    setEditingSelections([]);
  }

  function toggleEditingSlot(slotId: string) {
    setEditingSelections((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId],
    );
  }

  async function saveAvailability(userId: string) {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, availabilitySlotIds: editingSelections }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "対応可能時間の更新に失敗しました。");
      return;
    }
    setMessage("対応可能時間を更新しました。");
    setEditingAvailabilityUserId(null);
    setEditingSelections([]);
    void reloadAll();
  }

  async function onClearMatch(matchId: string, partnerName: string, clientName: string) {
    const ok = window.confirm(
      `マッチをクリアしますか？\n\n` +
        `対象: ${withHonorificSan(partnerName)} - ${withHonorificSan(clientName)}\n` +
        `※ このマッチのチャット・日程調整履歴も削除されます。`,
    );
    if (!ok) return;

    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/matches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "マッチクリアに失敗しました。");
      return;
    }
    setMessage("マッチをクリアしました。担当変更用に新しい組み合わせを登録できます。");
    void reloadAll();
  }

  async function onDeleteUser(userId: string, displayName: string, role: AssignableRole) {
    const ok = window.confirm(
      `本当に ${displayName}（${role}）を削除しますか？\n\n` +
        `アプリ上のアカウントとログイン情報を削除します（Firebase Console の操作は不要です）。\n` +
        `削除後は同じメールアドレスで新規登録できます。\n` +
        `（マッチ・チャットなどの履歴は残ります）`,
    );
    if (!ok) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "ユーザー削除に失敗しました。");
      return;
    }
    setMessage(
      "ユーザーを削除しました。同じメールアドレスでの新規登録が可能になりました。",
    );
    void reloadAll();
  }

  function toggleMatchSelection(matchId: string) {
    setSelectedMatchIds((prev) =>
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId],
    );
  }

  function startEditingName(u: RoleUser) {
    setEditingNameUserId(u.id);
    setEditingNameDraft(u.displayName);
    setError(null);
  }

  function cancelEditingName() {
    setEditingNameUserId(null);
    setEditingNameDraft("");
  }

  async function saveDisplayName(userId: string) {
    const name = editingNameDraft.trim();
    if (!name) {
      setError("表示名を入力してください。");
      return;
    }
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, displayName: name }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "表示名の更新に失敗しました。");
      return;
    }
    setMessage("表示名を更新しました。");
    cancelEditingName();
    void reloadAll();
  }

  /**
   * 1 ユーザー分の li を描画する。
   * `users.filter(...)` でクライアント / パートナーの 2 グループに分けて呼び出す。
   */
  function renderUserItem(u: RoleUser) {
    const isEditing = editingAvailabilityUserId === u.id;
    const isEditingName = editingNameUserId === u.id;
    const labels = labelsForSlotIds(u.availabilitySlotIds, availabilityOptions);
    const isClientRole =
      u.role === "CLIENT" || u.role === "CLIENT_ADMIN" || u.role === "CLIENT_HR";
    const canEditName = viewerRole === "ADMIN";
    return (
      <li
        key={u.id}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block min-w-[12rem] flex-1 space-y-1 text-xs font-semibold text-slate-600">
                  表示名
                  <input
                    value={editingNameDraft}
                    onChange={(e) => setEditingNameDraft(e.target.value)}
                    maxLength={80}
                    className="block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveDisplayName(u.id)}
                  className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={cancelEditingName}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {/* 名前をクリックすると、管理者専用「このユーザーの状況」ビューに飛ぶ。
                    なりすましログインではなく、FTA や参加マッチを管理者として確認するための
                    readonly ビュー。クライアント・パートナーが本人視点で見ているデータの実状を
                    確認したい時の主要動線。 */}
                <Link
                  href={`/admin/users/${encodeURIComponent(u.id)}`}
                  className="text-base font-semibold text-indigo-900 break-words no-underline hover:underline"
                  title="このユーザーの状況（自分FTA・参加マッチ）を確認"
                >
                  {u.displayName}
                </Link>
                {canEditName ? (
                  <button
                    type="button"
                    onClick={() => startEditingName(u)}
                    className="rounded-md border border-slate-200 bg-slate-50 p-1.5 text-slate-600 hover:bg-slate-100"
                    title="表示名を編集"
                    aria-label={`${u.displayName}の表示名を編集`}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
            )}
            <p className="text-xs text-zinc-600 break-all">{u.email}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Firebase: {u.firebaseUid ? "連携済み" : "未連携"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onDeleteUser(u.id, u.displayName, u.role as AssignableRole)}
            className="shrink-0 rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
          >
            削除
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            ロール
            <select
              value={u.role}
              onChange={(e) => void onRoleChange(u.id, e.target.value as AssignableRole)}
              className="block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm font-normal normal-case text-zinc-900"
            >
              <option value="PARTNER">PARTNER</option>
              <option value="CLIENT">CLIENT</option>
              <option value="CLIENT_ADMIN">CLIENT_ADMIN（クライアント管理者）</option>
              <option value="CLIENT_HR">CLIENT_HR（クライアント人事）</option>
            </select>
          </label>
          <div className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            所属企業
            {isClientRole ? (
              (() => {
                const currentId = (u.companyId ?? "").trim();
                const knownIds = new Set(companies.map((c) => c.id));
                const isStale = currentId.length > 0 && !knownIds.has(currentId);
                const currentName = currentId
                  ? companies.find((c) => c.id === currentId)?.name ?? `未登録ID: ${currentId}`
                  : "未所属";
                const isEditingCompany = editingCompanyUserId === u.id;
                const isBusy = companySavingUserId === u.id;
                if (!isEditingCompany) {
                  // 通常表示：誤クリックで変わらないよう、明示的に「編集」を押した時だけ select を出す。
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`block flex-1 truncate rounded-md border border-zinc-200 bg-slate-50 px-2 py-1.5 text-sm font-normal normal-case ${
                          currentId ? "text-zinc-900" : "text-zinc-500"
                        }`}
                        title={currentId ? `${currentName}（${currentId}）` : "未所属"}
                      >
                        {currentName}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditingCompany(u)}
                        disabled={companies.length === 0}
                        className="shrink-0 rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        編集
                      </button>
                      {isStale ? (
                        <span className="block w-full text-[11px] font-normal normal-case text-amber-700">
                          ※ この企業IDはアプリ設定に登録されていません。アプリ設定で登録するか、別の企業に変更してください。
                        </span>
                      ) : null}
                    </div>
                  );
                }
                // 編集モード：選択しても即保存はしない。明示の「保存」ボタンで確認ダイアログ。
                const draftId = editingCompanyDraft.trim();
                const draftKnown = draftId ? knownIds.has(draftId) : true;
                const changed = draftId !== currentId;
                return (
                  <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-2">
                    <select
                      value={editingCompanyDraft}
                      onChange={(e) => setEditingCompanyDraft(e.target.value)}
                      disabled={companies.length === 0 || isBusy}
                      className="block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm font-normal normal-case text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      <option value="">未所属</option>
                      {!draftKnown && draftId ? (
                        <option value={draftId}>（未登録ID: {draftId}）</option>
                      ) : null}
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}（{c.id}）
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveCompanyAssignment(u)}
                        disabled={!changed || isBusy}
                        className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                      >
                        {isBusy ? "保存中…" : "保存"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingCompany}
                        disabled={isBusy}
                        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        キャンセル
                      </button>
                      {changed ? (
                        <span className="text-[11px] font-normal normal-case text-indigo-800">
                          保存ボタンで確認ダイアログが表示されます。
                        </span>
                      ) : (
                        <span className="text-[11px] font-normal normal-case text-zinc-500">
                          変更なし
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <span className="block text-sm font-normal normal-case text-zinc-400">—</span>
            )}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">対応可能時間</p>
          {isEditing ? (
            <div className="mt-2 space-y-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
              {availabilityOptions.map((opt) => (
                <label
                  key={opt.id}
                  className="flex cursor-pointer items-center gap-2 text-sm text-emerald-950"
                >
                  <input
                    type="checkbox"
                    checked={editingSelections.includes(opt.id)}
                    onChange={() => toggleEditingSlot(opt.id)}
                    className="h-4 w-4 accent-emerald-700"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void saveAvailability(u.id)}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={cancelEditingAvailability}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {labels.length === 0 ? (
                <span className="text-sm text-zinc-400">未設定</span>
              ) : (
                <ul className="flex flex-wrap gap-1">
                  {labels.map((label, i) => (
                    <li
                      key={`${u.id}-slot-${i}`}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => startEditingAvailability(u)}
                className="text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
              >
                {u.role === "PARTNER" ? "編集（管理者入力）" : "編集（本人選択を上書き）"}
              </button>
            </div>
          )}
        </div>
      </li>
    );
  }

  async function onBulkClearMatches() {
    if (selectedMatchIds.length === 0) return;
    const ok = window.confirm(
      `選択した ${selectedMatchIds.length} 件のマッチを一括クリアしますか？\n` +
        `※ 各マッチのチャット・日程調整履歴も削除されます。`,
    );
    if (!ok) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/matches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchIds: selectedMatchIds }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "一括クリアに失敗しました。");
      return;
    }
    setMessage(`${data?.deleted ?? selectedMatchIds.length} 件のマッチをクリアしました。`);
    void reloadAll();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10">
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-indigo-800 uppercase">
          Administrator
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">マッチ管理</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          登録済みのパートナーとクライアントを 1対1 で紐づけます。アプリ画面上では連絡先は非公開のまま運用されます。一覧のメール列は運用確認用のみです。
        </p>
      </header>

        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8">
          <h2 className="text-lg font-semibold text-slate-950">新しいマッチを登録</h2>
          <p className="mt-2 text-sm text-zinc-600">
            同じ組み合わせは二重登録できません。フィルタでユーザーを絞り込めます。
          </p>

          <form className="mt-8 space-y-6" onSubmit={onSubmit}>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-zinc-900">パートナー</label>
                <input
                  type="search"
                  value={partnerFilter}
                  onChange={(e) => setPartnerFilter(e.target.value)}
                  placeholder="名前・メールで絞り込み"
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/25"
                />
                <select
                  name="partnerId"
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-xs focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/25"
                  defaultValue=""
                >
                  <option value="" disabled>
                    ユーザーを選択
                  </option>
                  {filteredPartners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}（{p.email}）
                    </option>
                  ))}
                </select>
                {filteredPartners.length === 0 ? (
                  <p className="text-xs text-amber-800">該当するパートナーがいません。先に登録してください。</p>
                ) : null}
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-semibold text-zinc-900">クライアント</label>
                <input
                  type="search"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  placeholder="名前・メールで絞り込み"
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/25"
                />
                <select
                  name="clientId"
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 shadow-xs focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/25"
                  defaultValue=""
                >
                  <option value="" disabled>
                    ユーザーを選択
                  </option>
                  {filteredClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}（{c.email}）
                    </option>
                  ))}
                </select>
                {filteredClients.length === 0 ? (
                  <p className="text-xs text-amber-800">該当するクライアントがいません。先に登録してください。</p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-800"
              >
                この組み合わせでマッチを作成
              </button>
              <button
                type="button"
                onClick={() => void reloadAll()}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                一覧を再読込
              </button>
            </div>
          </form>

          {error ? <p className="mt-6 text-sm font-medium text-red-700">{error}</p> : null}
          {message ? <p className="mt-6 text-sm font-medium text-emerald-800">{message}</p> : null}
        </section>

        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 md:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-950">ユーザーのロール管理</h2>
            <span className="text-xs text-slate-500">Firebase連携ユーザーの切替に使います</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            クライアント（クライアント管理者含む）とパートナーを別の枠で表示しています。ロール切替で枠を跨いで移動します。
            パートナーの対応可能時間は管理者がここで入力します。クライアントのものは登録時に本人が選択した内容を表示します。
            <br />
            <span className="text-xs text-slate-500">
              「所属企業」は、<Link href="/admin/settings" className="text-indigo-700 underline">アプリ設定 → 企業（テナント）</Link>で登録された企業からのみ選択できます。
              <strong>同じ企業のクライアント同士</strong>だけが自分FTAを閲覧でき、
              <strong>同じ企業のクライアントの日程一覧</strong>のみクライアント管理者から見えます。別企業間は絶対に交わりません。
            </span>
          </p>
          {companies.length === 0 ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              企業がまだ 1 件も登録されていません。
              <Link href="/admin/settings" className="ml-1 font-semibold underline">
                アプリ設定 → 企業（テナント）
              </Link>{" "}
              から登録してください。
            </p>
          ) : null}
          {(() => {
            const clientUsers = users.filter(
              (u) =>
                u.role === "CLIENT" || u.role === "CLIENT_ADMIN" || u.role === "CLIENT_HR",
            );
            const partnerUsers = users.filter((u) => u.role === "PARTNER");
            return (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3 sm:p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      クライアント
                      <span className="ml-2 text-xs font-medium text-slate-500">
                        （CLIENT / CLIENT_ADMIN / CLIENT_HR）
                      </span>
                    </h3>
                    <span className="text-xs font-medium text-slate-500">
                      {clientUsers.length} 名
                    </span>
                  </div>
                  {clientUsers.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-500">
                      クライアントはまだ登録されていません。
                    </p>
                  ) : (
                    <ul className="space-y-3">{clientUsers.map((u) => renderUserItem(u))}</ul>
                  )}
                </div>
                <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3 sm:p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">パートナー</h3>
                    <span className="text-xs font-medium text-slate-500">
                      {partnerUsers.length} 名
                    </span>
                  </div>
                  {partnerUsers.length === 0 ? (
                    <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-500">
                      パートナーはまだ登録されていません。
                    </p>
                  ) : (
                    <ul className="space-y-3">{partnerUsers.map((u) => renderUserItem(u))}</ul>
                  )}
                </div>
              </div>
            );
          })()}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 md:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-950">登録済みマッチ一覧</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {loading
                  ? "読込中…"
                  : companyFilter
                    ? `${filteredMatches.length} / ${matches.length} 件`
                    : `${matches.length} 件`}
              </span>
              <button
                type="button"
                disabled={selectedMatchIds.length === 0}
                onClick={() => void onBulkClearMatches()}
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                選択したマッチを一括クリア
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="font-medium">企業で絞り込み</span>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">すべて</option>
                <option value="__none__">未登録（企業ID未設定）</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.id}）
                  </option>
                ))}
              </select>
            </label>
            {companyFilter ? (
              <button
                type="button"
                onClick={() => setCompanyFilter("")}
                className="text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
              >
                絞り込みをクリア
              </button>
            ) : null}
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl ring-1 ring-slate-200/80">
            <table className="min-w-full border-collapse bg-white text-left text-sm">
              <thead className="bg-slate-50/90">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-3 pr-3 font-semibold">
                    <input
                      type="checkbox"
                      aria-label="表示中のマッチをすべて選択"
                      checked={
                        filteredMatches.length > 0 &&
                        filteredMatches.every((m) => selectedMatchIds.includes(m.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMatchIds((prev) =>
                            Array.from(new Set([...prev, ...filteredMatches.map((m) => m.id)])),
                          );
                        } else {
                          const visible = new Set(filteredMatches.map((m) => m.id));
                          setSelectedMatchIds((prev) => prev.filter((id) => !visible.has(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="py-3 pr-4 font-semibold">登録日時</th>
                  <th className="py-3 pr-4 font-semibold">クライアント</th>
                  <th className="py-3 pr-4 font-semibold">メール（管理用）</th>
                  <th className="py-3 pr-4 font-semibold">クライアント企業</th>
                  <th className="py-3 pr-4 font-semibold">パートナー</th>
                  <th className="py-3 pr-4 font-semibold">メール（管理用）</th>
                  <th className="py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches.map((row) => (
                  <tr
                    key={row.id}
                    id={`match-row-${row.id}`}
                    className={`border-b border-zinc-100 text-zinc-800 transition-colors ${
                      focusedMatchId === row.id ? "bg-amber-100/70 ring-2 ring-amber-400" : ""
                    }`}
                  >
                    <td className="py-3 pr-3 align-top">
                      <input
                        type="checkbox"
                        checked={selectedMatchIds.includes(row.id)}
                        onChange={() => toggleMatchSelection(row.id)}
                        aria-label={`${row.client.displayName}-${row.partner.displayName}を選択`}
                      />
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 align-top text-zinc-600">
                      {formatJa(row.createdAt)}
                    </td>
                    <td className="py-3 pr-4 align-top font-medium text-zinc-950">
                      <Link
                        href={`/admin/users/${encodeURIComponent(row.client.id)}`}
                        className="text-indigo-900 no-underline hover:underline"
                        title={`${row.client.displayName} さんの状況（自分FTA・参加マッチ）`}
                      >
                        {withHonorificSan(row.client.displayName)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 align-top text-xs text-zinc-500">{row.client.email}</td>
                    <td className="py-3 pr-4 align-top text-sm text-zinc-700">
                      {row.client.companyName?.trim() ? row.client.companyName : "—"}
                    </td>
                    <td className="py-3 pr-4 align-top font-medium text-zinc-950">
                      <Link
                        href={`/admin/users/${encodeURIComponent(row.partner.id)}`}
                        className="text-indigo-900 no-underline hover:underline"
                        title={`${row.partner.displayName} さんの状況（参加マッチ）`}
                      >
                        {withHonorificSan(row.partner.displayName)}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 align-top text-xs text-zinc-500">{row.partner.email}</td>
                    <td className="py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/match/${row.id}`}
                          className="inline-flex rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white no-underline shadow-sm hover:bg-indigo-800"
                        >
                          ルームを開く
                        </Link>
                        <button
                          type="button"
                          onClick={() => void onClearMatch(row.id, row.partner.displayName, row.client.displayName)}
                          className="inline-flex rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 shadow-sm hover:bg-red-100"
                        >
                          マッチをクリア
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && matches.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
              まだマッチがありません。上のフォームから登録してください。
            </p>
          ) : !loading && filteredMatches.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
              この絞り込み条件に該当するマッチはありません。
            </p>
          ) : null}
        </section>
    </div>
  );
}
