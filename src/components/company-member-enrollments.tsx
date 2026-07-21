"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { companyPlanLabel, type CompanyPlan } from "@/lib/company-plan";

type ProgramRow = { id: string; name: string; plan: CompanyPlan };
type MemberRow = {
  id: string;
  displayName: string;
  role: string;
  companyId?: string | null;
  enrolledProgramIds?: string[];
};

export function CompanyMemberEnrollments({ companyId }: { companyId: string }) {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const clientMembers = useMemo(
    () =>
      members.filter(
        (m) =>
          (m.companyId ?? "") === companyId &&
          (m.role === "CLIENT" || m.role === "CLIENT_ADMIN" || m.role === "CLIENT_HR"),
      ),
    [members, companyId],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [programsRes, usersRes] = await Promise.all([
        fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/programs`, {
          cache: "no-store",
        }),
        fetch("/api/admin/users", { cache: "no-store" }),
      ]);
      const programsJson = await programsRes.json().catch(() => null);
      const usersJson = await usersRes.json().catch(() => null);
      if (!programsRes.ok || !usersRes.ok) {
        setError("取得に失敗しました。");
        return;
      }
      setPrograms(Array.isArray(programsJson?.programs) ? programsJson.programs : []);
      setMembers(Array.isArray(usersJson?.users) ? usersJson.users : []);
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggleProgram(userId: string, programId: string, on: boolean) {
    const user = clientMembers.find((m) => m.id === userId);
    if (!user) return;
    const baseline =
      user.enrolledProgramIds && user.enrolledProgramIds.length > 0
        ? user.enrolledProgramIds
        : programs
            .filter((p) => p.plan !== "coaching_management_training")
            .map((p) => p.id);
    const current = new Set(baseline);
    if (on) current.add(programId);
    else current.delete(programId);
    const nextIds = programs.map((p) => p.id).filter((id) => current.has(id));
    setSavingUserId(userId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, enrolledProgramIds: nextIds }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(typeof json?.error === "string" ? json.error : "保存に失敗しました。");
        return;
      }
      setMessage(`${user.displayName} さんの参加プログラムを更新しました。`);
      await reload();
    } catch {
      setError("ネットワークエラーが発生しました。");
    } finally {
      setSavingUserId(null);
    }
  }

  function isEnrolled(user: MemberRow, programId: string, plan: CompanyPlan) {
    const enrolled = user.enrolledProgramIds;
    if (!enrolled || enrolled.length === 0) {
      // 未設定時はコーチング研修以外を参加扱い（研修は明示チェックが必要）
      return plan !== "coaching_management_training";
    }
    return enrolled.includes(programId);
  }

  if (programs.length <= 1) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">メンバーの参加プログラム</h2>
      <p className="mt-1 text-sm text-slate-600">
        クライアント系ユーザーが参加するプログラムを個別に設定します。
        コーチングマネジメント研修はチェックしたメンバーだけに未割当ルームが自動作成されます（他プラン企業への漏洩防止）。
      </p>

      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-600">読込中…</p>
      ) : clientMembers.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">この企業に所属するクライアント系ユーザーがいません。</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">メンバー</th>
                {programs.map((p) => (
                  <th key={p.id} className="px-3 py-2 whitespace-nowrap">
                    {p.name}
                    <span className="mt-0.5 block font-normal normal-case text-slate-500">
                      {companyPlanLabel(p.plan)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientMembers.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {m.displayName}
                    <span className="ml-1 text-xs font-normal text-slate-500">({m.role})</span>
                  </td>
                  {programs.map((p) => (
                    <td key={p.id} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isEnrolled(m, p.id, p.plan)}
                        disabled={savingUserId === m.id}
                        onChange={(e) => void toggleProgram(m.id, p.id, e.target.checked)}
                        aria-label={`${m.displayName} — ${p.name}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
