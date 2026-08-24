/**
 * モチベイジ提唱の 1on1 の型（コーチングマネジメント研修・参照用）。
 * 画面表示の正本。メモ本文はユーザー入力で別保存する。
 */

export type MotivageOneOnOneStepId =
  | "icebreak"
  | "intent"
  | "theme"
  | "organize"
  | "learning"
  | "action";

export type MotivageOneOnOneExampleGroup = {
  title?: string;
  examples: string[];
};

export type MotivageOneOnOneStep = {
  id: MotivageOneOnOneStepId;
  number: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  /** サイドバー用の短い目的 */
  goal: string;
  /** メイン見出し下の説明 */
  lead: string;
  exampleGroups: MotivageOneOnOneExampleGroup[];
  tips: { tone: "info" | "emphasis"; text: string }[];
  footerNote?: string;
};

export const MOTIVAGE_ONE_ON_ONE_STEPS: MotivageOneOnOneStep[] = [
  {
    id: "icebreak",
    number: 1,
    title: "アイスブレイク",
    goal: "話しやすい状態をつくる",
    lead: "いきなり本題に入るのではなく、仕事モードから対話モードへ切り替えます。",
    exampleGroups: [
      {
        examples: [
          "「最近どうですか？」",
          "「この前の〇〇、どうでしたか？」",
          "「お盆休みはどうでしたか？」",
        ],
      },
    ],
    tips: [
      {
        tone: "emphasis",
        text: "アイスブレイクの目的は、無理に会話を盛り上げることではありません。仕事の話に入る前に緊張をほぐし、話しやすい状態をつくることです。",
      },
    ],
    footerNote: "第1回で作成した『アイスブレイクのネタ帳』も活用しましょう。",
  },
  {
    id: "intent",
    number: 2,
    title: "1on1の意図を伝える",
    goal: "安心して話せる場だと伝える",
    lead: "1on1を始めるときに、「この時間は何のための時間なのか」を伝えます。",
    exampleGroups: [
      {
        examples: [
          "「今日も1on1をしていきますが、この時間は〇〇さんのための時間です。」",
          "「評価面談や進捗確認の時間ではないので、安心して話してください。」",
          "「仕事のことでも、それ以外でも、話したいことを自由に話してください。」",
        ],
      },
    ],
    tips: [
      {
        tone: "info",
        text: "「ここでは安心して話していい」と伝えることで、部下が自分のことを話しやすくなります。",
      },
    ],
  },
  {
    id: "theme",
    number: 3,
    title: "テーマを設定する",
    goal: "今日話したいことを決める",
    lead: "1on1で話すテーマは、基本的に部下が決めます。上司が話したいテーマから始めるのではなく、まずは部下が今話したいことを聞いてみましょう。",
    exampleGroups: [
      {
        examples: [
          "「今日はどんなことをお話ししましょうか？」",
          "「最近、気になっていることはありますか？」",
          "「今日は何について話したいですか？」",
        ],
      },
    ],
    tips: [
      {
        tone: "emphasis",
        text: "1on1は、上司が聞きたいことを確認する時間ではなく、部下のための時間です。",
      },
    ],
  },
  {
    id: "organize",
    number: 4,
    title: "経験や考えを整理する",
    goal: "具体化し、考えを広げる",
    lead: "テーマが決まったら、傾聴しながら経験を具体化し、考えや可能性を横に広げていきます。",
    exampleGroups: [
      {
        title: "まず、具体化する",
        examples: [
          "「もう少し詳しく教えてください」",
          "「具体的には、どんなことがありましたか？」",
          "「そのとき、どう感じましたか？」",
          "「例えば、どんな場面ですか？」",
        ],
      },
      {
        title: "次に、横に広げる",
        examples: [
          "「他にはありますか？」",
          "「他に考えられることはありますか？」",
          "「逆に、うまくいっているときはありますか？」",
          "「別の見方をすると、どうでしょう？」",
        ],
      },
    ],
    tips: [
      {
        tone: "info",
        text: "ここでは主に、傾聴＋情報収集の質問を使います。一つの答えだけで終わらせず、効果的な質問で考えを広げます。",
      },
      {
        tone: "emphasis",
        text: "目的は上司の情報収集だけではありません。質問に答えながら、部下自身が頭の中を整理していくことが大切です。",
      },
    ],
  },
  {
    id: "learning",
    number: 5,
    title: "学びを引き出す",
    goal: "経験を学びに変える",
    lead: "具体的な経験を十分に話したあと、そこから学びや教訓を引き出します（抽象化）。",
    exampleGroups: [
      {
        examples: [
          "「この経験から、何を学びましたか？」",
          "「今回うまくいったポイントは何だと思いますか？」",
          "「他にも使えそうなことはありますか？」",
          "「仕事で大切にしていることは何だと思いますか？」",
        ],
      },
    ],
    tips: [
      {
        tone: "info",
        text: "ここでは主に、効果的な質問を使います。",
      },
      {
        tone: "emphasis",
        text: "「何があったか」で終わらせず、「この経験から何を学んだか」まで考えてもらいます。",
      },
    ],
  },
  {
    id: "action",
    number: 6,
    title: "次の行動につなげる",
    goal: "学びを次の実践につなげる",
    lead: "学びや気づきが出てきたら、「次にどうするか」まで考えてもらいます。必要に応じて、上司から成長機会を提案することも大切です。",
    exampleGroups: [
      {
        title: "次の行動を引き出す",
        examples: [
          "「その学びを、次はどう活かしたいですか？」",
          "「同じようなことが起きたら、次はどう行動しますか？」",
          "「どの機会で試してみたいですか？」",
          "「まず何からやってみますか？」",
        ],
      },
      {
        title: "いつ・何をやるかを確認する",
        examples: [
          "「では、次回の1on1までに一度やってみましょう」",
          "「次の〇〇の機会で、試してみてください」",
          "「やってみてどうだったか、次回ぜひ教えてください」",
        ],
      },
      {
        title: "上司だからできる機会創出（例）",
        examples: [
          "「では、次の〇〇社向けのプレゼン、担当してみるのはどうですか？」",
          "「次の会議では、〇〇さんから説明してみますか？」",
        ],
      },
      {
        title: "1回ですべて解決しなくてもよいとき",
        examples: [
          "「少し考えてみて、また次回話しましょう」",
          "「一度やってみて、その結果をまた聞かせてください」",
        ],
      },
    ],
    tips: [
      {
        tone: "info",
        text: "部下自身から行動が出てきたら、「いいですね。ぜひやってみてください！」と次の一歩を後押しします。",
      },
      {
        tone: "emphasis",
        text: "1on1は1回の対話で完結するものではなく、部下の成長を継続的に支援する時間です。行動を具体にしておくと、話した内容を実際の仕事につなげやすくなります。",
      },
    ],
  },
];

export const MOTIVAGE_ONE_ON_ONE_STEP_IDS = MOTIVAGE_ONE_ON_ONE_STEPS.map((s) => s.id);

export function getMotivageOneOnOneStep(id: MotivageOneOnOneStepId): MotivageOneOnOneStep {
  const found = MOTIVAGE_ONE_ON_ONE_STEPS.find((s) => s.id === id);
  if (!found) return MOTIVAGE_ONE_ON_ONE_STEPS[0]!;
  return found;
}
