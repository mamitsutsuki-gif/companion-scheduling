"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

/**
 * 管理者ホーム画面用の企業フィルタ。
 * URL の `?company=...` を更新することで、サーバーコンポーネント側の
 * `searchParams.company` で一覧が再フィルタされる。
 * - `""`: すべて
 * - `"__none__"`: 企業ID未割当のクライアントのみ
 * - 任意 ID: その企業のクライアントのみ
 */
export function DashboardCompanyFilter({
  companies,
  activeCompanyId,
}: {
  companies: Array<{ id: string; name: string }>;
  activeCompanyId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = useCallback(
    (next: string) => {
      const sp = new URLSearchParams(params?.toString());
      if (!next) sp.delete("company");
      else sp.set("company", next);
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname, router],
  );

  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <span className="font-medium">企業で絞り込み</span>
      <select
        value={activeCompanyId}
        onChange={(e) => onChange(e.target.value)}
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
  );
}
