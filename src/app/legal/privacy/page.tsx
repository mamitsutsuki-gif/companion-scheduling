import Link from "next/link";
import { PRIVACY_POLICY } from "./content";
import { SecurityActionMark } from "@/components/security-action-mark";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold text-indigo-700">
        <Link href="/register" className="text-indigo-800 underline">
          ← 新規登録に戻る
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">プライバシーポリシー</h1>
      <article className="mt-6 space-y-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
        {PRIVACY_POLICY}
      </article>
      <aside className="mt-10 border-t border-slate-200 pt-8">
        <p className="text-sm font-semibold text-slate-900">情報セキュリティへの取り組み</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          当社は、独立行政法人情報処理推進機構（IPA）の SECURITY ACTION（二つ星）に基づき、情報セキュリティ対策に取り組むことを自己宣言しています。マークの詳細は IPA の案内をご覧ください。
        </p>
        <div className="mt-4">
          <SecurityActionMark size="md" />
        </div>
      </aside>
    </div>
  );
}
