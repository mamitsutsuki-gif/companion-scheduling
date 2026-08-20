import Link from "next/link";
import { CsaStarMark } from "@/components/csa-star-mark";
import { SecurityActionMark } from "@/components/security-action-mark";

/** ログイン・登録など AuthShell 向けの控えめな信頼表示 */
export function SecurityTrustAuthFooter() {
  return (
    <div className="mt-8 border-t border-slate-100 pt-5">
      <div className="flex items-center justify-center gap-3">
        <SecurityActionMark size="xs" />
        <CsaStarMark size="xs" />
      </div>
      <p className="mt-2.5 text-center text-[11px] leading-relaxed text-slate-500">
        <Link
          href="/legal/security"
          className="text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-800"
        >
          セキュリティへの取り組み
        </Link>
      </p>
    </div>
  );
}
