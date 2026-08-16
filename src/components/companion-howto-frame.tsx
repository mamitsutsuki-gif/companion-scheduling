"use client";

import type { CompanionHowtoAudience } from "@/lib/companion-howto";
import { companionHowtoSrc } from "@/lib/companion-howto";

export function CompanionHowtoFrame({ audience }: { audience: CompanionHowtoAudience }) {
  return (
    <iframe
      key={audience}
      src={companionHowtoSrc(audience)}
      title="個別伴走プラン 操作ガイド"
      className="min-h-[min(80vh,44rem)] w-full rounded-xl border border-slate-200 bg-white"
    />
  );
}
