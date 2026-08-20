import Link from "next/link";
import type { ReactNode } from "react";
import { CsaStarMark, CSA_STAR_REGISTRY_HREF } from "@/components/csa-star-mark";
import { SecurityActionMark, SECURITY_ACTION_HREF } from "@/components/security-action-mark";

type SecurityTrustCardProps = {
  logo: ReactNode;
  title: string;
  description: ReactNode;
  ctaLabel: string;
  ctaHref: string;
};

function SecurityTrustCard({ logo, title, description, ctaLabel, ctaHref }: SecurityTrustCardProps) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex h-28 items-center justify-center sm:h-32">{logo}</div>
      <h2 className="mt-5 text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 flex-1 space-y-3 text-sm leading-relaxed text-slate-600">{description}</div>
      <p className="mt-5 pt-1">
        <Link
          href={ctaHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-indigo-800 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-950"
        >
          {ctaLabel}
        </Link>
      </p>
    </article>
  );
}

export function SecurityTrustCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2 md:items-stretch">
      <SecurityTrustCard
        logo={<SecurityActionMark size="md" />}
        title="SECURITY ACTION 二つ星"
        description={
          <p>
            株式会社モチベイジは、独立行政法人情報処理推進機構（IPA）が実施する「SECURITY
            ACTION」において、二つ星を宣言しています。
          </p>
        }
        ctaLabel="SECURITY ACTION の詳細を見る"
        ctaHref={SECURITY_ACTION_HREF}
      />
      <SecurityTrustCard
        logo={<CsaStarMark size="md" />}
        title="CSA STAR Level 1 Self-Assessment"
        description={
          <>
            <p>
              モチベイジクラウドは、Cloud Security Alliance（CSA）が運営するSecurity, Trust,
              Assurance and Risk（STAR）Registryに登録されています。
            </p>
            <p>
              STAR Level 1では、Cloud Controls Matrix（CCM）に基づくConsensus Assessments
              Initiative Questionnaire（CAIQ）を用いて、クラウドサービスのセキュリティ対策に関する自己評価を実施・公開しています。
            </p>
          </>
        }
        ctaLabel="CSA STAR Registryで確認する"
        ctaHref={CSA_STAR_REGISTRY_HREF}
      />
    </div>
  );
}
