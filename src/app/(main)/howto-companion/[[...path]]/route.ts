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

const HOWTO_ROOT = path.join(process.cwd(), "content/howto-companion");

type RouteContext = { params: Promise<{ path?: string[] }> };

function defaultAudienceForRole(role: string): CompanionHowtoAudience {
  if (role === "PARTNER") return "partner";
  if (role === "CLIENT_ADMIN") return "supervisor";
  return "client";
}

function safeAssetPath(segments: string[]): string | null {
  if (segments[0] !== "assets") return null;
  if (segments.some((part) => part === ".." || part.includes("\0"))) return null;
  const rel = segments.join("/");
  const resolved = path.resolve(HOWTO_ROOT, rel);
  if (!resolved.startsWith(path.resolve(HOWTO_ROOT) + path.sep) && resolved !== path.resolve(HOWTO_ROOT)) {
    return null;
  }
  if (!rel.endsWith(".png")) return null;
  return resolved;
}

export async function GET(request: Request, context: RouteContext) {
  const session = await readSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const user = await getUserById(session.sub);
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { path: segments = [] } = await context.params;
  const rel = segments.join("/");

  if (rel && rel !== "index.html") {
    const assetPath = safeAssetPath(segments);
    if (!assetPath) return new NextResponse("Not found", { status: 404 });
    try {
      const bytes = await readFile(assetPath);
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  const requested = parseCompanionHowtoAudience(new URL(request.url).searchParams.get("audience"));
  const audience = requested ?? defaultAudienceForRole(user.role);
  if (!canViewCompanionHowtoAudience(user.role, audience)) {
    return new NextResponse("この操作ガイドは表示できません。", { status: 403 });
  }

  const raw = await readFile(path.join(HOWTO_ROOT, "index.html"), "utf8");
  const html = filterCompanionHowtoHtml(raw, audience);
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
