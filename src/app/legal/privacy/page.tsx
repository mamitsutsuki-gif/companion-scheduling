import Link from "next/link";
import { PRIVACY_POLICY } from "./content";
import { SecurityTrustCards } from "@/components/security-trust-cards";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
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
          SECURITY ACTION（二つ星）と CSA STAR Level 1 Self-Assessment の詳細は、
          <Link href="/legal/security" className="font-semibold text-indigo-800 underline">
            セキュリティページ
          </Link>
          をご覧ください。
        </p>
        <div className="mt-6">
          <SecurityTrustCards />
        </div>
      </aside>
    </div>
  );
}
