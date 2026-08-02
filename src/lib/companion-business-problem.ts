/** 業務課題実践｜問題解決8ステップ */

export const BUSINESS_PROBLEM_TEXT_MAX = 4000;

export type BusinessProblemFieldType = "text" | "textarea";

export type BusinessProblemFieldDef = {
  key: string;
  label: string;
  type: BusinessProblemFieldType;
};

export type BusinessProblemStepDef = {
  id: number;
  shortTitle: string;
  title: string;
  purpose: string;
  tasks: string[];
  fields: BusinessProblemFieldDef[];
  tips: string[];
  pitfalls: string[];
  coachQuestions: string[];
  examples: { goodA: string; goodB: string; bad: string; badFix: string };
};

export type BusinessProblemSheet = {
  userId: string;
  companyId: string;
  /** STEP id → fieldKey → value */
  stepValues: Record<string, Record<string, string>>;
  coachComment: string;
  updatedAt: string;
};

export const BUSINESS_PROBLEM_STEPS: BusinessProblemStepDef[] = [
  {
    "id": 1,
    "shortTitle": "問題認識",
    "title": "問題の認識",
    "purpose": "ありたい姿と現状のギャップを定量的に明確にし、「問題」を捉える。",
    "tasks": [
      "上位方針・部門方針・チーム目標を整理する",
      "本人の役割・Willを明確にする",
      "環境変化と現状を事実ベースで記述する",
      "ありたい姿を定量指標で定める",
      "Gap（問題）を数値で表現する"
    ],
    "fields": [
      {
        "key": "theme",
        "label": "テーマ",
        "type": "text"
      },
      {
        "key": "policy",
        "label": "上位方針・チーム目標",
        "type": "textarea"
      },
      {
        "key": "role",
        "label": "本人の役割・Will",
        "type": "textarea"
      },
      {
        "key": "env",
        "label": "環境変化",
        "type": "textarea"
      },
      {
        "key": "ideal",
        "label": "ありたい姿（定量）",
        "type": "textarea"
      },
      {
        "key": "current",
        "label": "現状（定量）",
        "type": "textarea"
      },
      {
        "key": "gap",
        "label": "Gap＝問題",
        "type": "textarea"
      }
    ],
    "tips": [
      "Gapは「もっと良くしたい」ではなく、数値で表せる差分にする",
      "ありたい姿は現状の裏返しにしない。期待水準を自分で設定する"
    ],
    "pitfalls": [
      "ありたい姿・現状が抽象的で定量Gapにならない",
      "環境変化の記述が薄く、取り組みの必要性が伝わらない"
    ],
    "coachQuestions": [
      "Gapは数値で説明できるか",
      "ありたい姿は組織の期待水準と整合しているか",
      "現状は事実か解釈か"
    ],
    "examples": {
      "goodA": "チーム目標「計数管理を効率化」。ありたい姿：業務効率20%向上。現状：月125時間。Gap：成り行きだと月25時間超過。",
      "goodB": "ありたい姿：工程良品率99.9%（12月まで）。現状：98.4%（改善後見込み98.9%）。Gap：1%のギャップ＝問題。",
      "bad": "ありたい姿「精度の高い結果を提供」は抽象的。現状「相関が低い」だけでは定量Gapにならない。",
      "badFix": "何の指標をいつまでにどの水準にするか定量的に書く。"
    }
  },
  {
    "id": 2,
    "shortTitle": "現状把握",
    "title": "現状の把握・問題点の特定",
    "purpose": "STEP1のGapをMECEに層別し、取り組む問題点を1つ特定する。原因分析はSTEP4から。",
    "tasks": [
      "層別の切り口を設定する（漏れなくダブりなく）",
      "層別結果を客観データで示す",
      "論拠を用いて問題点を1つ特定する",
      "なぜその問題点を選んだか理由を書く"
    ],
    "fields": [
      {
        "key": "slice",
        "label": "層別する切り口",
        "type": "textarea"
      },
      {
        "key": "sliceResult",
        "label": "層別結果",
        "type": "textarea"
      },
      {
        "key": "data",
        "label": "客観データ",
        "type": "textarea"
      },
      {
        "key": "problem",
        "label": "特定した問題点",
        "type": "textarea"
      },
      {
        "key": "reason",
        "label": "問題点を選んだ理由",
        "type": "textarea"
      }
    ],
    "tips": [
      "STEP2は切り分けのみ。原因の「なぜ」はSTEP4",
      "グラフや表で状態を可視化すると説得力が増す"
    ],
    "pitfalls": [
      "原因分析に飛ぶ（モデルが合っていない等）",
      "層別切り口が曖昧でMECEになっていない"
    ],
    "coachQuestions": [
      "その切り口はMECEか",
      "論拠は客観データか",
      "原因分析と混同していないか"
    ],
    "examples": {
      "goodA": "業務内容別・データ種類別に時間を層別。売上集計32h/月が最大。論拠付きで「資料作成の計数集計」に絞る。",
      "goodB": "製品仕様で層別→仕様Bが不良多発。工程で層別→レーザー溶接でα荷重不良が突出。",
      "bad": "「相関が悪い」だけで層別せず、いきなりモデル・ソフトを疑う。",
      "badFix": "ECU/BMS種類や信頼性の高低など、相関の差が出る切り口でMECEに層別する。"
    }
  },
  {
    "id": 3,
    "shortTitle": "目標設定",
    "title": "目標の設定",
    "purpose": "STEP2で特定した問題点に対する定量目標を設定し、STEP1への貢献度を計算する。",
    "tasks": [
      "目標指標・現状値・目標値・期限を定める",
      "STEP2の問題点に直結する目標にする（STEP1と同じにしない）",
      "ありたい姿への貢献度を%で計算する",
      "貢献度の根拠を書く"
    ],
    "fields": [
      {
        "key": "metric",
        "label": "目標指標",
        "type": "text"
      },
      {
        "key": "currentVal",
        "label": "現状値",
        "type": "text"
      },
      {
        "key": "targetVal",
        "label": "目標値",
        "type": "text"
      },
      {
        "key": "deadline",
        "label": "達成期限",
        "type": "text"
      },
      {
        "key": "contrib",
        "label": "ありたい姿への貢献度",
        "type": "text"
      },
      {
        "key": "contribReason",
        "label": "貢献度の根拠",
        "type": "textarea"
      }
    ],
    "tips": [
      "「精度向上」ではなく測定可能な指標にする",
      "貢献度は定量的に。STEP7の振り返りに使う"
    ],
    "pitfalls": [
      "STEP1と同じ目標を繰り返す",
      "貢献度を書かない、または根拠がない"
    ],
    "coachQuestions": [
      "この目標はSTEP2の問題点へのものか",
      "達成/未達を数値で判定できるか",
      "貢献度の計算根拠はあるか"
    ],
    "examples": {
      "goodA": "売上集計時間を3月末までに20時間削減。Gap25時間の80%に貢献。",
      "goodB": "α荷重不良を85件→5件（95%減）。ありたい姿99.9%への貢献約80%。",
      "bad": "目標が「シミュレーション精度向上」のまま。STEP2の問題点と無関係。",
      "badFix": "STEP2で特定した問題個所を、いつまでにどの水準にするか定量化する。"
    }
  },
  {
    "id": 4,
    "shortTitle": "原因追究",
    "title": "問題の本質追究",
    "purpose": "STEP2で特定した問題点から原因を広く洗い出し、データで真因を特定する。",
    "tasks": [
      "原因候補を漏れなく洗い出す（チームで検討）",
      "「何がどうなっている」形式で具体的に書く",
      "事実・データで裏付け、優先度（ウェイト）を付ける",
      "真因を特定し、判定理由を書く"
    ],
    "fields": [
      {
        "key": "causes",
        "label": "原因候補の洗い出し",
        "type": "textarea"
      },
      {
        "key": "evidence",
        "label": "事実・データ",
        "type": "textarea"
      },
      {
        "key": "priority",
        "label": "優先度・ウェイト",
        "type": "textarea"
      },
      {
        "key": "rootCause",
        "label": "真因",
        "type": "textarea"
      },
      {
        "key": "rootReason",
        "label": "真因判定理由",
        "type": "textarea"
      }
    ],
    "tips": [
      "単語（「精度が低い」）ではなく状態を記述",
      "×事実でない／×どうしようもないを区別する"
    ],
    "pitfalls": [
      "浅い掘り下げで真因が不明",
      "優先度がついていない",
      "STEP1の問題から原因分析を始める"
    ],
    "coachQuestions": [
      "問題と原因を混同していないか",
      "真因は再発防止に使えるか",
      "事実で裏付けられているか"
    ],
    "examples": {
      "goodA": "集計やり直しの真因：データ確定前に着手。計算式手入力の真因：マニュアル未整備。評価表で〇×判定。",
      "goodB": "魚骨図的に掘り下げ。加圧モータ推力→ボールねじ異物嚙み・熱によるゆるみを真因①②に特定。",
      "bad": "「モデルが合っていない」等の単語のみ。優先度なし、真因不明。",
      "badFix": "STEP2の問題点からスタートし、データで評価しながら深掘りする。"
    }
  },
  {
    "id": 5,
    "shortTitle": "対策立案",
    "title": "対策の立案",
    "purpose": "真因に対応した複数対策案を比較し、最適案と実行計画を決定する。",
    "tasks": [
      "真因ごとに複数の対策案を洗い出す",
      "効果・時間・コスト・リスクで評価・比較する",
      "実施する案を1つ決め、選定理由を書く",
      "ガントチャート等で実行計画を具体化する"
    ],
    "fields": [
      {
        "key": "options",
        "label": "対策案（複数）",
        "type": "textarea"
      },
      {
        "key": "eval",
        "label": "効果・コスト・リスク評価",
        "type": "textarea"
      },
      {
        "key": "selected",
        "label": "選定した対策",
        "type": "textarea"
      },
      {
        "key": "plan",
        "label": "実行計画（スケジュール）",
        "type": "textarea"
      }
    ],
    "tips": [
      "1真因に複数案。決め打ちに見えないよう比較表を使う",
      "工数・コストは定量的に"
    ],
    "pitfalls": [
      "対策が1つだけ",
      "実行計画が月単位の箇条書きのみで粗い"
    ],
    "coachQuestions": [
      "なぜその対策を選ぶのか",
      "他の案は検討したか",
      "計画は担当・期限まで具体か"
    ],
    "examples": {
      "goodA": "データ確定後着手（〇）vs マクロ作成（△コスト大）。ガントで10〜3月の実施項目を記載。",
      "goodB": "加圧リトライ追加（〇・20H）vs 洗浄工程追加（×・300万）。スケジュール表付き。",
      "bad": "「部品特性値を測定する」だけ。比較・評価なし。",
      "badFix": "複数案を効果・コストで比較し、なぜその案かを書く。"
    }
  },
  {
    "id": 6,
    "shortTitle": "対策実施",
    "title": "対策の実施",
    "purpose": "ありたい姿・目標・役割を共有し、実行計画に沿って進捗を報連相する。",
    "tasks": [
      "実施項目ごとに具体的アクションと工夫を記録する",
      "会議体・報告頻度・関係者連携を設計する",
      "遅延・手戻りがあれば原因と改善方向を書く",
      "「心がけ」ではなく、この案件固有の工夫を書く"
    ],
    "fields": [
      {
        "key": "actions",
        "label": "実施項目と具体的アクション",
        "type": "textarea"
      },
      {
        "key": "team",
        "label": "体制・会議体",
        "type": "textarea"
      },
      {
        "key": "progress",
        "label": "進捗・報連相",
        "type": "textarea"
      },
      {
        "key": "effort",
        "label": "実施上の工夫",
        "type": "textarea"
      }
    ],
    "tips": [
      "進捗をタイムリーに共有する仕組みを書く",
      "工夫は読み手が再現できる具体性で"
    ],
    "pitfalls": [
      "「スムーズな連携を心がけた」だけ",
      "会議体・頻度が不明"
    ],
    "coachQuestions": [
      "誰を巻き込む必要があるか",
      "遅延の原因は何か",
      "本人が判断したことは何か"
    ],
    "examples": {
      "goodA": "関係者確認→工程見直し→リマインド検証→トライアル→マニュアル反映。各項目に具体アクション。",
      "goodB": "部長報告1/w、知見者会議2/w、専用チャットで意見交換。改造内容を先輩にレビュー依頼。",
      "bad": "「計画通りに進めた」「関係者と連携した」のみ。",
      "badFix": "このテーマで工夫した具体行動、会議体・頻度を書く。"
    }
  },
  {
    "id": 7,
    "shortTitle": "効果確認",
    "title": "効果の確認",
    "purpose": "STEP1・STEP3の目標に対する達成度と、真因解消・進め方を振り返る。",
    "tasks": [
      "STEP3目標の達成/未達を定量で記録する",
      "STEP1への貢献度を再計算する",
      "真因が解消されたか評価する",
      "成功要因・失敗要因を次に活かせる形で書く"
    ],
    "fields": [
      {
        "key": "goalResult",
        "label": "STEP3目標の達成度",
        "type": "textarea"
      },
      {
        "key": "step1Result",
        "label": "STEP1への貢献",
        "type": "textarea"
      },
      {
        "key": "rootResult",
        "label": "真因解消の評価",
        "type": "textarea"
      },
      {
        "key": "reflect",
        "label": "進め方の振り返り",
        "type": "textarea"
      }
    ],
    "tips": [
      "実施有無だけでなく目標達成度を書く",
      "未達でも学びを次に接続する"
    ],
    "pitfalls": [
      "実行計画の実施チェックのみ",
      "STEP1/3との対比がない"
    ],
    "coachQuestions": [
      "STEP3目標に届いたか",
      "真因は解消されたか",
      "次の同様場面で再現できるか"
    ],
    "examples": {
      "goodA": "目標達成〇、作業時間18h削減（Gapの72%）。真因①②対策の振り返り表付き。",
      "goodB": "不具合85→4件。良品率99.72%（目標99.9%に0.18%不足）。継続改善へ。",
      "bad": "対策の進捗「済」の一覧のみ。目標達成度なし。",
      "badFix": "STEP3目標・STEP1貢献・真因解消を定量で振り返る。"
    }
  },
  {
    "id": 8,
    "shortTitle": "定着横展開",
    "title": "成果の定着・横展開",
    "purpose": "得られた成果を4W1Hで標準化し、他部署・他案件へ横展開する。",
    "tasks": [
      "標準化する対象（手順・テンプレ・マニュアル等）を決める",
      "4W1H（誰が・いつ・どこで・何を・どのように）で具体化する",
      "横展開先と方法を計画する",
      "次の課題・継続改善テーマを書く"
    ],
    "fields": [
      {
        "key": "standard",
        "label": "標準化（4W1H）",
        "type": "textarea"
      },
      {
        "key": "spread",
        "label": "横展開",
        "type": "textarea"
      },
      {
        "key": "next",
        "label": "次の課題",
        "type": "textarea"
      }
    ],
    "tips": [
      "「横展開する」ではなく誰にいつ何をするか",
      "標準化と横展開を分けて書く"
    ],
    "pitfalls": [
      "抽象的な取り組み方針のみ",
      "日程・担当がない"
    ],
    "coachQuestions": [
      "誰がいつ何をどう実施するか",
      "他部署で役立つか",
      "次の6か月のテーマに接続できるか"
    ],
    "examples": {
      "goodA": "マニュアル改善・他部署展開（4月）。マクロ勉強会企画（年内）。",
      "goodB": "手順ドキュメント化・ポータル掲載（11月）。各工場へオンライン情報提供会（1月）。",
      "bad": "「関係者とPDCAを回す」等の一般論のみ。",
      "badFix": "4W1Hで標準化・横展開を具体化する。"
    }
  }
];

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function trimText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function emptyStepValues(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const step of BUSINESS_PROBLEM_STEPS) {
    const fields: Record<string, string> = {};
    for (const f of step.fields) fields[f.key] = "";
    out[String(step.id)] = fields;
  }
  return out;
}

export function normalizeBusinessProblemSheet(
  userId: string,
  companyId: string,
  input: unknown,
): BusinessProblemSheet {
  const raw = asRecord(input);
  const base = emptyStepValues();
  const incoming = asRecord(raw.stepValues);
  for (const step of BUSINESS_PROBLEM_STEPS) {
    const sid = String(step.id);
    const src = asRecord(incoming[sid]);
    for (const f of step.fields) {
      base[sid][f.key] = trimText(src[f.key], BUSINESS_PROBLEM_TEXT_MAX);
    }
  }
  return {
    userId,
    companyId,
    stepValues: base,
    coachComment: trimText(raw.coachComment, BUSINESS_PROBLEM_TEXT_MAX),
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

export function businessProblemTheme(sheet: BusinessProblemSheet): string {
  return (sheet.stepValues["1"]?.theme ?? "").trim();
}

export function businessProblemStepFillCounts(sheet: BusinessProblemSheet): Array<{ stepId: number; filled: number; total: number }> {
  return BUSINESS_PROBLEM_STEPS.map((step) => {
    const vals = sheet.stepValues[String(step.id)] ?? {};
    const filled = step.fields.filter((f) => (vals[f.key] ?? "").trim()).length;
    return { stepId: step.id, filled, total: step.fields.length };
  });
}
