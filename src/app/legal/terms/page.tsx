import Link from "next/link";
import { TERMS_OF_SERVICE } from "./content";

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold text-indigo-700">
        <Link href="/register" className="text-indigo-800 underline">
          ← 新規登録に戻る
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">利用規約</h1>
      <article className="mt-6 space-y-4 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
        {TERMS_OF_SERVICE}
      </article>
    </div>
  );
}
