"use client";

/**
 * デザイン改修の方向性を 3 パターン並べて見比べるための、管理者専用プレビュー。
 *
 * 各 variants には「実際の画面でよく出る部品（ヘッダ・ヒーロー・状態バナー・
 * 次のアクション・担当ペアカード・主要ボタン・バッジ）」を、本物に近いデモ
 * データで描く。これにより、色だけでなく余白・角丸・シャドウ・タイポグラフィ
 * までを総合的に判断できるようにする。
 *
 * このファイルは「採用が決まったら本体に反映 → これは削除」の前提で書いており、
 * 既存のアプリ全体に影響を与えない（このファイルだけ読み込んでもどこにも flow
 * しない）。
 */
import { useState } from "react";

type Demo = {
  greetingName: string;
  pendingActions: Array<{
    tag: "やること" | "要対応" | "情報";
    message: string;
    cta: string;
  }>;
  pairs: Array<{
    client: string;
    partner: string;
    company: string;
  }>;
  banner: { kind: "todo" | "warn" | "info"; message: string; cta: string };
};

const DEMO: Demo = {
  greetingName: "田中",
  pendingActions: [
    {
      tag: "要対応",
      message: "佐藤さん（クライアント）に第 1 回（初回）の候補日を送ってください。",
      cta: "候補日を送る",
    },
    {
      tag: "やること",
      message: "鈴木さん からの未読メッセージが 2 件あります。",
      cta: "チャットを開く",
    },
    {
      tag: "情報",
      message: "第 3 回はまもなく開始です（5/20(水) 23:00 〜）。",
      cta: "セッション詳細",
    },
  ],
  pairs: [
    { client: "佐藤 美咲", partner: "田中 健一", company: "株式会社 アクメ" },
    { client: "鈴木 翔", partner: "田中 健一", company: "Globex Inc." },
  ],
  banner: {
    kind: "todo",
    message: "あなたの番です — 第 1 回の候補日に ◯× で回答してください。",
    cta: "回答する",
  },
};

/* ============================================================
   Variant A — インディゴ × ティール（現状磨き上げ）
   ・ブランドカラーを 1 系統に統一し、画面間のバラつきを解消
   ・全カードを `rounded-2xl + border + shadow-sm` で統一
   ・タイポは Inter + Noto Sans JP、見出しと本文の差を強める
   ・誠実・落ち着き・コーチング業界に合う印象
   ============================================================ */
function VariantA() {
  return (
    <div
      className="rounded-3xl border border-slate-200 bg-slate-50 p-6"
      style={{ fontFamily: "'Inter','Noto Sans JP',system-ui,sans-serif" }}
    >
      {/* App header */}
      <div className="flex items-center justify-between rounded-xl bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-700 text-sm font-bold text-white">
            M
          </div>
          <span className="text-base font-semibold tracking-tight text-slate-900">
            モチベイジクラウド
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-lg bg-indigo-50 px-3 py-1.5 font-medium text-indigo-900">
            ホーム
          </span>
          <span className="rounded-lg px-3 py-1.5 text-slate-600">通知</span>
          <span className="rounded-lg px-3 py-1.5 text-slate-600">自分FTA</span>
          <span className="ml-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700">
            {DEMO.greetingName} さん
          </span>
        </div>
      </div>

      {/* Hero */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-indigo-700 uppercase">
          Overview
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
          {DEMO.greetingName} さん
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
          各ペアのチャットと日程調整を 1 か所で。メールアドレスを公開せずに対話できます。
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          ロール: パートナー
        </div>
      </div>

      {/* Status banner */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
        <p className="text-sm font-semibold text-indigo-950">{DEMO.banner.message}</p>
        <button className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-800">
          {DEMO.banner.cta}
        </button>
      </div>

      {/* Next actions */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          あなたの次のアクション{" "}
          <span className="text-sm font-normal text-slate-500">(3 件)</span>
        </h2>
        <ul className="mt-3 space-y-2">
          {DEMO.pendingActions.map((a) => {
            const pal =
              a.tag === "要対応"
                ? "border-amber-300 bg-amber-50"
                : a.tag === "やること"
                  ? "border-indigo-200 bg-indigo-50/40"
                  : "border-slate-200 bg-slate-50";
            const tagPal =
              a.tag === "要対応"
                ? "bg-amber-200 text-amber-900"
                : a.tag === "やること"
                  ? "bg-indigo-100 text-indigo-900"
                  : "bg-slate-100 text-slate-700";
            return (
              <li
                key={a.message}
                className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${pal}`}
              >
                <div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tagPal}`}>
                    {a.tag}
                  </span>
                  <p className="mt-1 text-sm text-slate-900">{a.message}</p>
                </div>
                <button className="shrink-0 rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-800">
                  {a.cta}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Pair cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {DEMO.pairs.map((p) => (
          <div
            key={p.client}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
          >
            <p className="text-[11px] font-medium tracking-widest text-slate-500 uppercase">
              Pair
            </p>
            <p className="mt-2 text-base font-semibold text-slate-900">
              {p.client}
              <span className="mx-2 font-normal text-slate-400">↔</span>
              {p.partner}
            </p>
            <p className="mt-1 text-xs text-slate-500">{p.company}</p>
            <div className="mt-3 flex justify-end">
              <button className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-800">
                ルームを開く
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Variant B — ネイビー × ゴールド（プレミアム SaaS）
   ・濃紺ベースで信頼感、アクセントにゴールド
   ・タイトルにセリフ系（Playfair + Noto Serif JP）、本文は Inter
   ・角丸は控えめ（rounded-md / rounded-lg）、シャドウは少し厚め
   ・高単価のエグゼクティブコーチング・コンサル系の SaaS LP の世界観
   ============================================================ */
function VariantB() {
  return (
    <div
      className="rounded-3xl border border-slate-200 p-6"
      style={{
        fontFamily: "'Inter','Noto Sans JP',sans-serif",
        background:
          "linear-gradient(180deg,#FAF7F0 0%,#FFFFFF 60%)",
      }}
    >
      {/* App header */}
      <div
        className="flex items-center justify-between rounded-lg px-5 py-3"
        style={{ background: "#0B1A33", color: "#F5EFE0" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-md text-sm font-bold"
            style={{ background: "#C9A227", color: "#0B1A33" }}
          >
            M
          </div>
          <span
            className="text-base tracking-wide"
            style={{
              fontFamily: "'Playfair Display','Noto Serif JP',serif",
              letterSpacing: "0.04em",
            }}
          >
            Motiveij<span style={{ color: "#C9A227" }}>·</span>Cloud
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className="rounded-md px-3 py-1.5 font-medium"
            style={{ background: "rgba(201,162,39,0.15)", color: "#F5EFE0" }}
          >
            Home
          </span>
          <span className="rounded-md px-3 py-1.5 text-slate-200/80">Notifications</span>
          <span className="rounded-md px-3 py-1.5 text-slate-200/80">My FTA</span>
          <span className="ml-2 rounded-full border border-amber-300/40 px-3 py-1.5 text-xs">
            {DEMO.greetingName} さん
          </span>
        </div>
      </div>

      {/* Hero */}
      <div
        className="mt-5 rounded-lg border bg-white p-7"
        style={{ borderColor: "#E7DDC4" }}
      >
        <p
          className="text-[11px] font-semibold tracking-[0.28em] uppercase"
          style={{ color: "#C9A227" }}
        >
          Overview
        </p>
        <h1
          className="mt-2 text-3xl tracking-tight"
          style={{
            fontFamily: "'Playfair Display','Noto Serif JP',serif",
            color: "#0B1A33",
            fontWeight: 600,
          }}
        >
          {DEMO.greetingName} さん
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
          経営層向けコーチングの 1on1 を、信頼の置けるプラットフォームで運営します。
        </p>
        <div
          className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
          style={{ borderColor: "#C9A227", color: "#7C5A00" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#C9A227" }} />
          Role: Partner
        </div>
      </div>

      {/* Status banner */}
      <div
        className="mt-4 flex items-center justify-between gap-3 rounded-lg border-l-4 p-4"
        style={{
          background: "#FFF8E6",
          borderColor: "#C9A227",
        }}
      >
        <p className="text-sm font-semibold" style={{ color: "#3D2E00" }}>
          {DEMO.banner.message}
        </p>
        <button
          className="rounded-md px-4 py-1.5 text-xs font-semibold text-white shadow-md"
          style={{ background: "#0B1A33" }}
        >
          {DEMO.banner.cta}
        </button>
      </div>

      {/* Next actions */}
      <div
        className="mt-4 rounded-lg border bg-white p-5 shadow-md"
        style={{ borderColor: "#E7DDC4" }}
      >
        <h2
          className="text-lg"
          style={{
            fontFamily: "'Playfair Display','Noto Serif JP',serif",
            color: "#0B1A33",
            fontWeight: 600,
          }}
        >
          Next Actions
          <span className="ml-2 text-sm font-normal text-slate-500">(3 件)</span>
        </h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {DEMO.pendingActions.map((a) => (
            <li key={a.message} className="flex items-start justify-between gap-3 py-3">
              <div>
                <span
                  className="rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                  style={{
                    background:
                      a.tag === "要対応"
                        ? "#0B1A33"
                        : a.tag === "やること"
                          ? "rgba(201,162,39,0.18)"
                          : "#F3EFE3",
                    color:
                      a.tag === "要対応"
                        ? "#C9A227"
                        : a.tag === "やること"
                          ? "#7C5A00"
                          : "#3D2E00",
                  }}
                >
                  {a.tag === "要対応"
                    ? "URGENT"
                    : a.tag === "やること"
                      ? "TODO"
                      : "INFO"}
                </span>
                <p className="mt-1.5 text-sm text-slate-800">{a.message}</p>
              </div>
              <button
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: "#0B1A33" }}
              >
                {a.cta}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Pair cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {DEMO.pairs.map((p) => (
          <div
            key={p.client}
            className="rounded-lg border bg-white p-5 shadow-md transition hover:shadow-lg"
            style={{ borderColor: "#E7DDC4" }}
          >
            <p
              className="text-[10px] tracking-[0.3em] uppercase"
              style={{ color: "#C9A227" }}
            >
              Pair
            </p>
            <p
              className="mt-2 text-base"
              style={{
                color: "#0B1A33",
                fontFamily: "'Inter','Noto Sans JP',sans-serif",
                fontWeight: 600,
              }}
            >
              {p.client}
              <span className="mx-2 font-normal text-slate-400">·</span>
              {p.partner}
            </p>
            <p className="mt-1 text-xs text-slate-500">{p.company}</p>
            <div className="mt-3 flex justify-end">
              <button
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: "#0B1A33" }}
              >
                ルームを開く →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Variant C — ティール × オフホワイト（モダン HR Tech）
   ・明るく親しみやすい印象、若手・HR/People チーム向け
   ・角丸を強め（rounded-3xl）、ピル状ボタン
   ・border はほぼ無し、shadow を薄く重ねて立体感
   ・Plus Jakarta Sans + Noto Sans JP
   ・スタートアップ感のある SaaS LP に近い世界観
   ============================================================ */
function VariantC() {
  return (
    <div
      className="rounded-3xl p-6"
      style={{
        background: "#F6F5F1",
        fontFamily: "'Plus Jakarta Sans','Noto Sans JP',sans-serif",
      }}
    >
      {/* App header */}
      <div
        className="flex items-center justify-between rounded-2xl bg-white px-5 py-3"
        style={{ boxShadow: "0 6px 24px rgba(15,118,110,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl bg-teal-700 text-sm font-bold text-white">
            M
          </div>
          <span className="text-base font-semibold text-slate-900">motiveij</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="rounded-full bg-teal-50 px-4 py-1.5 font-semibold text-teal-900">
            ホーム
          </span>
          <span className="rounded-full px-4 py-1.5 text-slate-600">通知</span>
          <span className="rounded-full px-4 py-1.5 text-slate-600">自分FTA</span>
          <span className="ml-2 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
            {DEMO.greetingName} さん
          </span>
        </div>
      </div>

      {/* Hero */}
      <div
        className="mt-5 overflow-hidden rounded-3xl bg-white p-7"
        style={{ boxShadow: "0 12px 40px rgba(15,118,110,0.07)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-teal-700 uppercase">
              Overview
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              こんにちは、{DEMO.greetingName} さん 👋
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
              担当ペアのチャット・日程調整・1on1 セッションを、ここから直感的に管理できます。
            </p>
          </div>
          <div className="rounded-2xl bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900">
            🟢 ロール: パートナー
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div
        className="mt-4 flex items-center justify-between gap-3 rounded-3xl bg-white px-5 py-4"
        style={{ boxShadow: "0 8px 28px rgba(99,102,241,0.10)" }}
      >
        <p className="text-sm font-semibold text-slate-900">{DEMO.banner.message}</p>
        <button className="rounded-full bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800">
          {DEMO.banner.cta} →
        </button>
      </div>

      {/* Next actions */}
      <div
        className="mt-4 rounded-3xl bg-white p-5"
        style={{ boxShadow: "0 8px 28px rgba(15,118,110,0.06)" }}
      >
        <h2 className="text-base font-bold text-slate-900">
          あなたの次のアクション
          <span className="ml-2 rounded-full bg-teal-700 px-2 py-0.5 text-xs font-bold text-white">
            3
          </span>
        </h2>
        <ul className="mt-3 space-y-2">
          {DEMO.pendingActions.map((a) => {
            const tagPal =
              a.tag === "要対応"
                ? "bg-amber-100 text-amber-800"
                : a.tag === "やること"
                  ? "bg-teal-100 text-teal-900"
                  : "bg-slate-100 text-slate-600";
            return (
              <li
                key={a.message}
                className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50/70 px-4 py-3"
              >
                <div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${tagPal}`}
                  >
                    {a.tag}
                  </span>
                  <p className="mt-1.5 text-sm text-slate-900">{a.message}</p>
                </div>
                <button className="shrink-0 rounded-full bg-teal-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-teal-800">
                  {a.cta}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Pair cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {DEMO.pairs.map((p) => (
          <div
            key={p.client}
            className="rounded-3xl bg-white p-5 transition hover:-translate-y-0.5"
            style={{ boxShadow: "0 10px 30px rgba(15,118,110,0.07)" }}
          >
            <p className="text-[10px] font-bold tracking-widest text-teal-700 uppercase">
              ペア
            </p>
            <p className="mt-2 text-base font-bold text-slate-900">
              {p.client}
              <span className="mx-2 font-normal text-slate-400">↔</span>
              {p.partner}
            </p>
            <p className="mt-1 text-xs text-slate-500">{p.company}</p>
            <div className="mt-3 flex justify-end">
              <button className="rounded-full bg-teal-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-teal-800">
                ルームを開く →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DesignPreviewGrid() {
  const [active, setActive] = useState<"A" | "B" | "C">("A");

  const variants = [
    {
      id: "A" as const,
      title: "Variant A — インディゴ × ティール",
      tagline: "現状磨き上げ・誠実・落ち着き（コーチング業界に合う）",
      element: <VariantA />,
    },
    {
      id: "B" as const,
      title: "Variant B — ネイビー × ゴールド",
      tagline: "プレミアム SaaS・経営層向け（高単価コーチングの世界観）",
      element: <VariantB />,
    },
    {
      id: "C" as const,
      title: "Variant C — ティール × オフホワイト",
      tagline: "明るいモダン HR Tech・親しみ（People チーム向け）",
      element: <VariantC />,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Google Fonts を preview ページ限定で読み込む（本体に影響しない）。
          採用後は next/font で適切に取り込む。 */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&family=Noto+Serif+JP:wght@500;600&family=Playfair+Display:wght@500;600&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap"
      />

      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setActive(v.id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              active === v.id
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {v.id} だけ表示
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActive("A")}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          A から順に並べる
        </button>
      </div>

      <div className="space-y-10">
        {variants
          .filter((v) => v.id === active || active === undefined)
          .map((v) => (
            <section key={v.id} className="space-y-3">
              <header>
                <h2 className="text-xl font-semibold text-slate-900">{v.title}</h2>
                <p className="text-sm text-slate-600">{v.tagline}</p>
              </header>
              {v.element}
            </section>
          ))}
      </div>
    </div>
  );
}
