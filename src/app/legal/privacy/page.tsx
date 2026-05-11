import Link from "next/link";
import { PRIVACY_POLICY } from "./content";

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
    </div>
  );
}
