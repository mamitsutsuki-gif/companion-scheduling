import { jsonError, jsonOk } from "@/lib/json";
import { maskedFtaChartForViewer } from "@/lib/fta";
import { getFtaByUserId } from "@/lib/repositories/fta-repository";
import { getUserById, listAdminVisibleUsers } from "@/lib/repositories/user-repository";
import { readSession } from "@/lib/session";
import { getEffectiveAppSettings } from "@/lib/repositories/app-settings-repository";

/**
 * 自分FTA の「他クライアント一覧」エンドポイント。
 * 同じ `companyId`（所属企業ID）を持つクライアント／クライアント管理者／クライアント人事だけを返す。
 * - 自分の companyId が未設定（空 or null）: 誰も見えない（charts: []、message を返す）。
 * - 他人の companyId が未設定: 見えない（その人も誰にも見られない）。
 * - 企業設定で「同じ企業ID内で自分FTAを共有する」が OFF: 自分以外は誰も見えない。
 * これにより、同じアプリに複数企業を混在させても企業間で FTA が露出しない。
 */
export async function GET() {
  const session = await readSession();
  if (!session) return jsonError("未ログインです。", 401);
  if (
    session.role !== "CLIENT" &&
    session.role !== "CLIENT_ADMIN" &&
    session.role !== "CLIENT_HR"
  ) {
    return jsonError("クライアントのみ閲覧できます。", 403);
  }

  const me = await getUserById(session.sub);
  const myCompanyId =
    (me as { companyId?: string | null } | null)?.companyId?.trim() ?? "";
  if (!myCompanyId) {
    return jsonOk({
      charts: [],
      companyId: null,
      message:
        "所属企業ID が未設定のため、他のクライアントの自分FTA は表示されません。管理者にお問い合わせください。",
    });
  }

  // 企業ごとに「同じ企業ID内で自分FTAを共有する」フラグを参照。未設定は true（=従来動作）。
  const effective = await getEffectiveAppSettings({ companyId: myCompanyId });
  if (effective.shareFtaWithinCompany === false) {
    return jsonOk({
      charts: [],
      companyId: myCompanyId,
      message:
        "この企業では「同じ企業ID内で自分FTAを共有する」設定が OFF のため、他のメンバーの自分FTA は表示されません。",
    });
  }

  // クライアントとクライアント管理者・クライアント人事の三者を「クライアント」として一覧化し、
  // 自分と同じ companyId を持つ人だけに絞る。
  const [clientsA, clientsB, clientsC] = await Promise.all([
    listAdminVisibleUsers("CLIENT"),
    listAdminVisibleUsers("CLIENT_ADMIN"),
    listAdminVisibleUsers("CLIENT_HR"),
  ]);
  const clients = [...clientsA, ...clientsB, ...clientsC];
  const others = clients.filter((u) => {
    if (u.id === session.sub) return false;
    const cid = (u as { companyId?: string | null }).companyId?.trim() ?? "";
    return cid && cid === myCompanyId;
  });
  const out = [];
  for (const c of others) {
    const chart = await getFtaByUserId(c.id);
    out.push({
      userId: c.id,
      displayName: c.displayName,
      chart: maskedFtaChartForViewer(chart),
    });
  }
  return jsonOk({ charts: out, companyId: myCompanyId });
}
