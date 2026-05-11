/**
 * 多テナント化の動作検証スクリプト（Firestore 不要・ロジック層のみで完結）。
 *
 * `getEffectiveAppSettings` に `global` と `override` を直接渡せる設計なので、
 * 本番 DB / Firestore に触らずに「A社が 30→45 分に上書き、B社は 30 分のまま」のような
 * シナリオをスキミュレートして合成結果と整合性を確認する。
 *
 * さらに、negotiations API が候補日時バリデーションに使う `slotEarliestHour /
 * slotLatestHour / allowWeekends / slotDurationMinutes / timezone` の各値が
 * 実効設定経由で正しく伝わるかも、同じバリデーション関数を再現してチェックする。
 *
 * 実行:  npx tsx scripts/verify-multi-tenant.ts
 */
import "dotenv/config";
import { addMinutes } from "date-fns";
import {
  getEffectiveAppSettings,
  normalizeCompanyAppSettingsOverride,
  type AppSettingsRow,
  type CompanyAppSettingsOverride,
} from "../src/lib/repositories/app-settings-repository";

type AssertResult = { name: string; ok: boolean; detail?: string };
const results: AssertResult[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  results.push({ name, ok: cond, detail });
}

function assertEq<T>(name: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({
    name,
    ok,
    detail: ok ? undefined : `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  });
}

const GLOBAL: AppSettingsRow = {
  id: "app",
  slotDurationMinutes: 30,
  totalSessions: 6,
  timezone: "Asia/Tokyo",
  availabilitySlotOptions: [
    { id: "weekday-am", label: "平日 9:00〜12:00" },
    { id: "weekday-pm", label: "平日 13:00〜18:00" },
  ],
  partnerExtraQuestionsByRound: {
    "4": ["これまで担当してみての気づきは？"],
  },
  sessionGuidelinesByRound: {
    "1": { client: "初回はゴール設定中心", partner: "傾聴 7 : 質問 3 で" },
  },
  slotEarliestHour: 8,
  slotLatestHour: 20,
  allowWeekends: false,
  companies: [
    { id: "company-a", name: "A社" },
    { id: "company-b", name: "B社" },
  ],
};

const OVERRIDE_A: CompanyAppSettingsOverride = normalizeCompanyAppSettingsOverride("company-a", {
  // A 社だけ 30→45 分・回数 6→8 回・終了時刻 20→22 時・土日許可に上書き
  slotDurationMinutes: 45,
  totalSessions: 8,
  slotLatestHour: 22,
  allowWeekends: true,
  // 対応可能時間も差し替え
  availabilitySlotOptions: [
    { id: "weekday-evening", label: "平日 18:00〜22:00" },
  ],
  partnerExtraQuestionsByRound: {
    "1": ["A社向け：プロジェクトの背景を確認しましたか？"],
  },
});

async function main() {
  // ============================================================
  // 1. 「企業IDなし」「未登録 ID」のとき、グローバルそのまま
  // ============================================================
  {
    const eff = await getEffectiveAppSettings({ companyId: null, global: GLOBAL, override: null });
    assertEq("1-1 companyId=null は global と同じ slotDurationMinutes", eff.slotDurationMinutes, 30);
    assertEq("1-2 companyId=null は effectiveCompanyId=null", eff.effectiveCompanyId, null);
    assertEq("1-3 companyId=null は overriddenFields=[]", eff.overriddenFields, []);
  }
  {
    const eff = await getEffectiveAppSettings({
      companyId: "%%illegal%%",
      global: GLOBAL,
      override: null,
    });
    assertEq("1-4 不正な companyId は sanitize されて空→global を返す", eff.slotDurationMinutes, 30);
    assertEq("1-5 不正 companyId でも overriddenFields=[]", eff.overriddenFields, []);
  }

  // ============================================================
  // 2. A社（上書きあり）の各フィールド差し替え
  // ============================================================
  {
    const effA = await getEffectiveAppSettings({
      companyId: "company-a",
      global: GLOBAL,
      override: OVERRIDE_A,
    });
    assertEq("2-1 A社 slotDurationMinutes は 45", effA.slotDurationMinutes, 45);
    assertEq("2-2 A社 totalSessions は 8", effA.totalSessions, 8);
    assertEq("2-3 A社 slotLatestHour は 22", effA.slotLatestHour, 22);
    assertEq("2-4 A社 allowWeekends は true", effA.allowWeekends, true);
    assertEq(
      "2-5 A社 availabilitySlotOptions は差し替え",
      effA.availabilitySlotOptions,
      [{ id: "weekday-evening", label: "平日 18:00〜22:00" }],
    );
    // 上書きしていない項目はグローバル値を保持
    assertEq("2-6 A社 timezone は global のまま Asia/Tokyo", effA.timezone, "Asia/Tokyo");
    assertEq("2-7 A社 slotEarliestHour は global のまま 8", effA.slotEarliestHour, 8);
    // companies / id はグローバル
    assertEq("2-8 A社 companies は global のまま 2 件", effA.companies.length, 2);
    // overriddenFields の中身
    const overridden = effA.overriddenFields.slice().sort();
    assertEq(
      "2-9 A社 overriddenFields の集合",
      overridden,
      [
        "allowWeekends",
        "availabilitySlotOptions",
        "partnerExtraQuestionsByRound",
        "slotDurationMinutes",
        "slotLatestHour",
        "totalSessions",
      ].sort(),
    );
    assertEq("2-10 A社 effectiveCompanyId=company-a", effA.effectiveCompanyId, "company-a");
  }

  // ============================================================
  // 3. B社（override なし）→グローバルそのまま
  // ============================================================
  {
    const effB = await getEffectiveAppSettings({
      companyId: "company-b",
      global: GLOBAL,
      override: null,
    });
    assertEq("3-1 B社 slotDurationMinutes は global 30 のまま", effB.slotDurationMinutes, 30);
    assertEq("3-2 B社 totalSessions は 6", effB.totalSessions, 6);
    assertEq("3-3 B社 slotLatestHour は 20", effB.slotLatestHour, 20);
    assertEq("3-4 B社 allowWeekends は false", effB.allowWeekends, false);
    assertEq("3-5 B社 effectiveCompanyId=company-b", effB.effectiveCompanyId, "company-b");
    assertEq("3-6 B社 overriddenFields=[]", effB.overriddenFields, []);
  }

  // ============================================================
  // 4. 部分上書き（slotDurationMinutes のみ）→他は global
  // ============================================================
  {
    const partial = normalizeCompanyAppSettingsOverride("company-c", {
      slotDurationMinutes: 60,
    });
    const effC = await getEffectiveAppSettings({
      companyId: "company-c",
      global: GLOBAL,
      override: partial,
    });
    assertEq("4-1 部分上書き: slotDurationMinutes は 60", effC.slotDurationMinutes, 60);
    assertEq("4-2 部分上書き: totalSessions は global 6", effC.totalSessions, 6);
    assertEq("4-3 部分上書き: allowWeekends は global false", effC.allowWeekends, false);
    assertEq("4-4 部分上書き: overriddenFields は ['slotDurationMinutes']", effC.overriddenFields, [
      "slotDurationMinutes",
    ]);
  }

  // ============================================================
  // 5. negotiations 等の候補時間バリデーションを実効設定で再現
  //    （A社=45min/週末OK/8時〜22時、B社=30min/平日のみ/8時〜20時）
  // ============================================================
  function validate(
    start: Date,
    settings: AppSettingsRow,
  ): { ok: boolean; reason?: string } {
    const end = addMinutes(start, settings.slotDurationMinutes);
    const tz = settings.timezone || "Asia/Tokyo";
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    const ps = Object.fromEntries(fmt.formatToParts(start).map((p) => [p.type, p.value]));
    const pe = Object.fromEntries(fmt.formatToParts(end).map((p) => [p.type, p.value]));
    const startMin = Number(ps.hour) * 60 + Number(ps.minute);
    const endMin =
      Number(pe.hour) === 0 && Number(pe.minute) === 0
        ? 24 * 60
        : Number(pe.hour) * 60 + Number(pe.minute);
    if (startMin < settings.slotEarliestHour * 60) return { ok: false, reason: "too-early" };
    if (endMin > settings.slotLatestHour * 60) return { ok: false, reason: "too-late" };
    if (!settings.allowWeekends) {
      const wk = String(ps.weekday).slice(0, 3);
      if (wk === "Sat" || wk === "Sun") return { ok: false, reason: "weekend" };
    }
    return { ok: true };
  }
  const effA = await getEffectiveAppSettings({
    companyId: "company-a",
    global: GLOBAL,
    override: OVERRIDE_A,
  });
  const effB = await getEffectiveAppSettings({
    companyId: "company-b",
    global: GLOBAL,
    override: null,
  });

  // 平日 2026-05-13(Wed) 21:00 JST 開始
  //   A社 (45min 21:00-21:45, 22:00 まで OK) → 通る
  //   B社 (30min 21:00-21:30, 20:00 まで) → 弾かれる
  const wedJst21 = new Date("2026-05-13T21:00:00+09:00");
  {
    const a = validate(wedJst21, effA);
    const b = validate(wedJst21, effB);
    assert("5-1 A社: 平日21:00 開始は許可", a.ok, a.reason);
    assert("5-2 B社: 平日21:00 開始は拒否(too-late)", !b.ok && b.reason === "too-late", b.reason);
  }

  // 土曜 2026-05-16(Sat) 10:00 JST 開始
  //   A社 allowWeekends=true → 通る
  //   B社 allowWeekends=false → 弾かれる
  const satJst10 = new Date("2026-05-16T10:00:00+09:00");
  {
    const a = validate(satJst10, effA);
    const b = validate(satJst10, effB);
    assert("5-3 A社: 土曜10:00 開始は許可（週末許可）", a.ok, a.reason);
    assert("5-4 B社: 土曜10:00 開始は拒否(weekend)", !b.ok && b.reason === "weekend", b.reason);
  }

  // 開始時刻早すぎ：2026-05-13(Wed) 07:00 JST
  //   両社とも slotEarliestHour=8 → 弾かれる
  const wedJst7 = new Date("2026-05-13T07:00:00+09:00");
  {
    const a = validate(wedJst7, effA);
    const b = validate(wedJst7, effB);
    assert("5-5 A社: 平日07:00 開始は拒否(too-early)", !a.ok && a.reason === "too-early", a.reason);
    assert("5-6 B社: 平日07:00 開始は拒否(too-early)", !b.ok && b.reason === "too-early", b.reason);
  }

  // ============================================================
  // 6. slotDurationMinutes が実際に「end = start + duration」で
  //    伝播することを確認（45min / 30min）
  // ============================================================
  {
    const start = new Date("2026-05-13T15:00:00+09:00");
    const endA = addMinutes(start, effA.slotDurationMinutes);
    const endB = addMinutes(start, effB.slotDurationMinutes);
    assertEq(
      "6-1 A社の end = start+45min",
      endA.toISOString(),
      new Date("2026-05-13T15:45:00+09:00").toISOString(),
    );
    assertEq(
      "6-2 B社の end = start+30min",
      endB.toISOString(),
      new Date("2026-05-13T15:30:00+09:00").toISOString(),
    );
  }

  // ============================================================
  // 7. partnerExtraQuestionsByRound / sessionGuidelinesByRound は
  //    上書きが「全体置換」されること（マージではなくフィールド単位の差し替え）
  // ============================================================
  {
    const effA2 = await getEffectiveAppSettings({
      companyId: "company-a",
      global: GLOBAL,
      override: OVERRIDE_A,
    });
    assertEq(
      "7-1 A社 partnerExtraQuestionsByRound は丸ごと差し替え",
      Object.keys(effA2.partnerExtraQuestionsByRound).sort(),
      ["1"],
    );
    // override 側で sessionGuidelinesByRound を指定していない → global の "1" だけ残る
    assertEq(
      "7-2 A社 sessionGuidelinesByRound は global の 1 回目のみ",
      Object.keys(effA2.sessionGuidelinesByRound).sort(),
      ["1"],
    );
  }

  // ============================================================
  // 集計
  // ============================================================
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;

  for (const r of results) {
    const mark = r.ok ? "✓" : "✗";
    const tail = r.ok ? "" : `  → ${r.detail ?? ""}`;
    // eslint-disable-next-line no-console
    console.log(`  ${mark} ${r.name}${tail}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n  total ${total}  passed ${passed}  failed ${failed}\n`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
