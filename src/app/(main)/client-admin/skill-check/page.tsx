import { redirect } from "next/navigation";

/** スキルチェックは「部下の伴走シート」に統合。旧 URL はそちらへ送る。 */
export default function ClientAdminSkillCheckPage() {
  redirect("/client-admin/companion-sheets");
}
