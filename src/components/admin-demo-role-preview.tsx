"use client";

import type { AdminDemoMatchPreview, DemoRole, DemoRolePreview } from "@/lib/admin-demo";
import { APP_DISPLAY_NAME } from "@/lib/brand";
import { MotiveIjiLogo } from "@/components/motive-iji-logo";

function formatJaRange(startAt: string, endAt: string) {
  try {
    const s = new Intl.DateTimeFormat("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(startAt));
    const e = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(endAt));
    return `${s} 〜 ${e}`;
  } catch {
    return startAt;
  }
}

function DemoPhoneFrame({
  roleLabel,
  children,
}: {
  roleLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-xl shadow-slate-900/10">
        <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-2.5 text-center">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Demo Preview</p>
          <p className="text-sm font-medium text-slate-800">{roleLabel}の画面イメージ</p>
        </div>
        <div className="border-b border-slate-100 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <MotiveIjiLogo variant="icon" className="h-7 w-7" />
            <span className="text-sm font-semibold text-slate-900">{APP_DISPLAY_NAME}</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function DemoNav({ items }: { items: DemoRolePreview["nav"] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 py-2">
      {items.map((item) => (
        <span
          key={item.label}
          className={[
            "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium",
            item.active ? "bg-indigo-50 text-indigo-900" : "text-slate-500",
          ].join(" ")}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function DemoFocusCard({ lines }: { lines: string[] }) {
  return (
    <div className="mx-3 mt-3 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-white p-4">
      <p className="text-xs font-semibold tracking-wide text-indigo-800 uppercase">Today</p>
      <ul className="mt-2 space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="text-sm leading-snug text-slate-800">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DemoMatchRoom({ preview }: { preview: DemoRolePreview }) {
  if (preview.role === "CLIENT_ADMIN") {
    return (
      <div className="mx-3 mt-3 space-y-3 pb-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-xs font-semibold text-indigo-900">1on1セッション一覧</p>
          {preview.clientAdminSessions && preview.clientAdminSessions.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {preview.clientAdminSessions.map((s, i) => (
                <li
                  key={`${s.clientDisplayName}-${s.sessionNumber}-${i}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800"
                >
                  <span className="font-semibold">{s.clientDisplayName}</span>
                  <span className="text-slate-500"> — 第{s.sessionNumber}回</span>
                  <p className="mt-0.5 text-slate-600">{formatJaRange(s.startAt, s.endAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500">確定済みセッションはまだありません</p>
          )}
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
          スキルチェックタブ — 社内メンバーのスキル把握
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 mt-3 space-y-3 pb-4">
      <p className="text-xs font-medium text-slate-500">マッチルーム</p>
      <div className="flex flex-wrap gap-1">
        {preview.matchRoomTabs.map((tab, i) => (
          <span
            key={tab}
            className={[
              "rounded-lg px-2 py-1 text-[11px] font-semibold",
              i === 0 ? "bg-white text-indigo-950 ring-1 ring-slate-200" : "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {tab}
          </span>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold text-indigo-900">1on1セッション（全{preview.sessions.length}回）</p>
        <ul className="mt-2 space-y-1.5">
          {preview.sessions.map((s) => (
            <li
              key={s.sessionNumber}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs"
            >
              <span className="font-medium text-slate-800">第{s.sessionNumber}回</span>
              <span
                className={
                  s.status === "done"
                    ? "text-emerald-700"
                    : s.status === "scheduled"
                      ? "text-indigo-700"
                      : "text-slate-500"
                }
              >
                {s.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AdminDemoRolePreviewPanel({
  preview,
  role,
}: {
  preview: AdminDemoMatchPreview;
  role: DemoRole;
}) {
  const rolePreview = preview.previews[role];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <DemoPhoneFrame roleLabel={rolePreview.roleLabel}>
        <DemoNav items={rolePreview.nav} />
        {role !== "CLIENT_ADMIN" ? <DemoFocusCard lines={rolePreview.focusLines} /> : null}
        <DemoMatchRoom preview={rolePreview} />
      </DemoPhoneFrame>

      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{rolePreview.roleLabel}向けの見え方</h3>
          <p className="mt-1 text-sm text-slate-600">
            {preview.companyName} / {preview.planLabel} — {preview.clientName} × {preview.partnerName}
          </p>
        </div>
        <ul className="space-y-2">
          {rolePreview.highlights.map((h) => (
            <li key={h} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
              {h}
            </li>
          ))}
        </ul>
        {role !== "CLIENT_ADMIN" ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-800">マッチルームのタブ構成</p>
            <p className="mt-1">{rolePreview.matchRoomTabs.join(" · ")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminDemoRoleTabs({
  role,
  onRole,
}: {
  role: DemoRole;
  onRole: (r: DemoRole) => void;
}) {
  const tabs: Array<{ id: DemoRole; label: string }> = [
    { id: "CLIENT", label: "クライアント" },
    { id: "CLIENT_ADMIN", label: "クライアント管理者" },
    { id: "PARTNER", label: "パートナー" },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="ロール別プレビュー">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={role === t.id}
          onClick={() => onRole(t.id)}
          className={[
            "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
            role === t.id
              ? "bg-indigo-700 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
