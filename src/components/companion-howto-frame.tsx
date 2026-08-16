"use client";

import { useCallback, type SyntheticEvent } from "react";
import type { CompanionHowtoAudience } from "@/lib/companion-howto";
import { companionHowtoSrc } from "@/lib/companion-howto";

function prepareEmbeddedHowto(iframe: HTMLIFrameElement, audience: CompanionHowtoAudience) {
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.documentElement.classList.add("howto-embed");
  const style = doc.createElement("style");
  style.textContent = `
    html.howto-embed .site-header,
    html.howto-embed .tab-bar,
    html.howto-embed .site-footer { display: none !important; }
    html.howto-embed .page-layout { padding-top: 0; }
  `;
  doc.head.appendChild(style);
  doc.querySelectorAll(".tab-btn, .tab-panel").forEach((el) => {
    const tab = el.getAttribute("data-tab");
    if (tab && tab !== audience) {
      el.setAttribute("hidden", "");
      if (el instanceof HTMLElement) el.style.display = "none";
    }
  });
}

export function CompanionHowtoFrame({ audience }: { audience: CompanionHowtoAudience }) {
  const onLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement>) => {
      prepareEmbeddedHowto(event.currentTarget, audience);
    },
    [audience],
  );

  return (
    <iframe
      key={audience}
      src={companionHowtoSrc(audience)}
      title="個別伴走プラン 操作ガイド"
      onLoad={onLoad}
      className="min-h-[min(80vh,44rem)] w-full rounded-xl border border-slate-200 bg-white"
      sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
    />
  );
}
