import type { Role } from "@prisma/client";
import { isIndividualCompanionPlan, type CompanyPlan } from "@/lib/company-plan";

export const COMPANION_HOWTO_AUDIENCES = ["client", "supervisor", "partner"] as const;
export type CompanionHowtoAudience = (typeof COMPANION_HOWTO_AUDIENCES)[number];

export function companionHowtoEnabled(plan: CompanyPlan): boolean {
  return isIndividualCompanionPlan(plan);
}

/** マッチルームに出す操作ガイド。運営（モチベイジ）向けは出さない。 */
export function companionHowtoAudiencesForViewer(input: {
  role: Role;
  supervisorViewer: boolean;
}): CompanionHowtoAudience[] {
  if (input.role === "ADMIN" || input.role === "ADMIN_ASSISTANT") {
    return [...COMPANION_HOWTO_AUDIENCES];
  }
  if (input.supervisorViewer) return ["supervisor"];
  if (input.role === "PARTNER") return ["partner"];
  return ["client"];
}

export function companionHowtoLabel(input: {
  audience: CompanionHowtoAudience;
  showAudienceInLabel: boolean;
}): string {
  if (!input.showAudienceInLabel) return "操作ガイド";
  if (input.audience === "client") return "操作ガイド（受講者）";
  if (input.audience === "supervisor") return "操作ガイド（上司）";
  return "操作ガイド（パートナー）";
}

export function companionHowtoSrc(audience: CompanionHowtoAudience): string {
  return `/howto-companion/?audience=${audience}#${audience}`;
}

export function parseCompanionHowtoAudience(input: unknown): CompanionHowtoAudience | null {
  if (input === "client" || input === "supervisor" || input === "partner") return input;
  return null;
}

/** ログイン中ロールが見てよいガイド。運営章はどのロールにも出さない。 */
export function canViewCompanionHowtoAudience(
  role: Role,
  audience: CompanionHowtoAudience,
): boolean {
  if (role === "ADMIN" || role === "ADMIN_ASSISTANT") return true;
  if (role === "PARTNER") return audience === "partner";
  if (role === "CLIENT_ADMIN") return audience === "supervisor" || audience === "client";
  return audience === "client";
}

const HOWTO_PANEL_TABS = ["client", "supervisor", "partner", "ops"] as const;

/** 完成版HTMLから、指定ロール以外の章・タブを取り除く。 */
export function filterCompanionHowtoHtml(html: string, audience: CompanionHowtoAudience): string {
  let out = html;
  for (const tab of HOWTO_PANEL_TABS) {
    if (tab === audience) continue;
    out = out.replace(new RegExp(`<button\\b[^>]*data-tab="${tab}"[^>]*>[\\s\\S]*?<\\/button>`, "g"), "");
    out = out.replace(new RegExp(`<section\\b[^>]*id="panel-${tab}"[\\s\\S]*?<\\/section>`, "g"), "");
  }
  out = out.replace(/<nav class="tab-bar"[\s\S]*?<\/nav>/, "");
  out = out.replace(
    new RegExp(`(<section\\b[^>]*id="panel-${audience}"[^>]*)(\\shidden)`),
    "$1",
  );
  if (!out.includes('href="/howto-companion/"')) {
    out = out.replace("<head>", `<head>\n  <base href="/howto-companion/" />`);
  }
  out = out.replace(
    "</head>",
    `<style id="howto-embed-css">.site-header,.tab-bar,.site-footer{display:none!important}</style>\n</head>`,
  );
  return out;
}
