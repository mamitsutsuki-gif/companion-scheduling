import Link from "next/link";
import { SecurityTrustCards } from "@/components/security-trust-cards";

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold text-indigo-700">
        <Link href="/" className="text-indigo-800 underline">
          ← トップに戻る
        </Link>
      </p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">セキュリティ</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
        モチベイジクラウドでは、情報セキュリティへの取り組みを、IPA の SECURITY ACTION と CSA STAR
        Level 1 Self-Assessment により公開しています。
      </p>
      <section className="mt-8" aria-label="セキュリティ自己宣言・自己評価">
        <SecurityTrustCards />
      </section>
    </div>
  );
}
