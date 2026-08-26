import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { getUserById } from "@/lib/repositories/user-repository";
import {
  canViewCompanionHowtoAudience,
  filterCompanionHowtoHtml,
  parseCompanionHowtoAudience,
  type CompanionHowtoAudience,
} from "@/lib/companion-howto";

export const dynamic = "force-dynamic";

const HOWTO_INDEX = path.join(process.cwd(), "content", "howto-companion", "index.html");

function defaultAudienceForRole(role: string): CompanionHowtoAudience {
  if (role === "PARTNER") return "partner";
  if (role === "CLIENT_ADMIN" || role === "CLIENT_HR") return "supervisor";
  return "client";
}

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const user = await getUserById(session.sub);
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const requested = parseCompanionHowtoAudience(new URL(request.url).searchParams.get("audience"));
  const audience = requested ?? defaultAudienceForRole(user.role);
  if (!canViewCompanionHowtoAudience(user.role, audience)) {
    return new NextResponse("この操作ガイドは表示できません。", { status: 403 });
  }

  const raw = await readFile(HOWTO_INDEX, "utf8");
  const html = filterCompanionHowtoHtml(raw, audience);
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
