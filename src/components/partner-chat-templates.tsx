"use client";

import { useState } from "react";
import { PARTNER_CHAT_TEMPLATE_GROUPS } from "@/lib/partner-chat-templates";

export function PartnerChatTemplates() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copyBody(title: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(title);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("error");
      window.setTimeout(() => setCopied(null), 2000);
    }
  }

  return (
    <section className="app-surface-indigo mt-6 space-y-3 rounded-2xl px-4 py-4 sm:px-5">
      <h3 className="text-base font-semibold text-indigo-950">チャット例文（パートナー専用）</h3>
      <p className="text-sm leading-relaxed text-indigo-900/90">
        コピー＆ペーストしてご利用ください。クライアントにはこの一覧は表示されません。
      </p>
      <ul className="space-y-3">
        {PARTNER_CHAT_TEMPLATE_GROUPS.map((g) => (
          <li key={g.title} className="app-surface-raised rounded-xl px-3 py-3">
            <p className="text-sm font-semibold text-slate-900">{g.title}</p>
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-2 py-2 font-sans text-sm text-slate-800">
              {g.body}
            </pre>
            <button
              type="button"
              onClick={() => void copyBody(g.title, g.body)}
              className="app-btn-primary mt-2 rounded-lg px-3 py-1.5 text-sm"
            >
              {copied === g.title ? "コピーしました" : "本文をコピー"}
            </button>
          </li>
        ))}
      </ul>
      {copied === "error" ? (
        <p className="text-sm text-amber-800">コピーに失敗しました。手動で選択してください。</p>
      ) : null}
    </section>
  );
}
