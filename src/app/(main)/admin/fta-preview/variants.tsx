"use client";

import type { FtaChart } from "@/lib/fta";
import { defaultFtaChart } from "@/lib/fta";

/**
 * 自分FTA ビジュアル候補。
 * 共通方針: 円の配置計算（cRingRadii / actionNodes / bRadius）は元 FtaViewer と
 * 完全に同一。各バリアントが触るのは「色 / 線幅 / 文字スタイル / SVG filter」だけ。
 * これにより、現状で発生していない重なりは新デザインでも発生しない。
 */

type Variant = "current" | "A" | "B" | "C" | "D";

type Style = {
  /** A (vision) の塗り / 線色 / 線幅 */
  a: { fill: string; stroke: string; strokeWidth: number };
  /** B の塗り / 線色 / 線幅 */
  b: { fill: string; stroke: string; strokeWidth: number };
  /** C の塗り / 線色 / 線幅 */
  c: { fill: string; stroke: string; strokeWidth: number };
  /** A/B/C のテキスト Tailwind クラス（色・太さ・サイズ） */
  aText: string;
  bText: string;
  cText: string;
  /** ガイド線の色 */
  lineMain: string;
  lineSub: string;
  /** SVG filter の id（影をかけたいなら "fta-shadow-X" 等） */
  shadow?: { id: string; def: React.ReactElement };
};

function softShadow(id: string): { id: string; def: React.ReactElement } {
  // 控えめなドロップシャドウ。box-shadow ではなく SVG filter なので、tailwind の制約外で
  // 「ふんわり」した立体感を出せる（slopパターンの典型 box-shadow とは別物）。
  return {
    id,
    def: (
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
        <feOffset dx="0" dy="2" result="off" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.2" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    ),
  };
}

function styleFor(variant: Variant): Style {
  switch (variant) {
    case "current":
      return {
        a: { fill: "#e0e7ff", stroke: "#4f46e5", strokeWidth: 2.5 },
        b: { fill: "#f8fafc", stroke: "#94a3b8", strokeWidth: 1 },
        c: { fill: "#fefce8", stroke: "#f59e0b", strokeWidth: 1 },
        aText: "text-[14px] font-semibold text-indigo-900",
        bText: "text-[13px] font-medium text-slate-800",
        cText: "text-[12px] font-medium text-amber-900",
        lineMain: "#cbd5e1",
        lineSub: "#e2e8f0",
      };
    case "A":
      // コントラスト強化: 白＋濃いめ輪郭、文字を中央と同じ font-semibold で揃える
      return {
        a: { fill: "#eef2ff", stroke: "#4338ca", strokeWidth: 3 },
        b: { fill: "#ffffff", stroke: "#475569", strokeWidth: 2.5 },
        c: { fill: "#fef3c7", stroke: "#d97706", strokeWidth: 2.5 },
        aText: "text-[15px] font-semibold text-indigo-950",
        bText: "text-[14px] font-semibold text-slate-900",
        cText: "text-[13px] font-semibold text-amber-950",
        lineMain: "#94a3b8",
        lineSub: "#cbd5e1",
        shadow: softShadow("fta-shadow-A"),
      };
    case "B":
      // ソフトカード: 淡い配色＋ふんわり影
      return {
        a: { fill: "#eef2ff", stroke: "#6366f1", strokeWidth: 2.5 },
        b: { fill: "#f5f5f4", stroke: "#a8a29e", strokeWidth: 2 },
        c: { fill: "#ecfdf5", stroke: "#10b981", strokeWidth: 2 },
        aText: "text-[14px] font-semibold text-indigo-900",
        bText: "text-[13px] font-semibold text-stone-900",
        cText: "text-[12px] font-semibold text-emerald-900",
        lineMain: "#a8a29e",
        lineSub: "#d6d3d1",
        shadow: softShadow("fta-shadow-B"),
      };
    case "C":
      // ブランド統一: インディゴ + ティール + アンバー
      return {
        a: { fill: "#e0e7ff", stroke: "#3730a3", strokeWidth: 3 },
        b: { fill: "#ecfeff", stroke: "#0e7490", strokeWidth: 2.5 },
        c: { fill: "#fff7ed", stroke: "#ea580c", strokeWidth: 2.5 },
        aText: "text-[15px] font-semibold text-indigo-950",
        bText: "text-[14px] font-semibold text-cyan-950",
        cText: "text-[13px] font-semibold text-orange-950",
        lineMain: "#0e7490",
        lineSub: "#a5f3fc",
        shadow: softShadow("fta-shadow-C"),
      };
    case "D":
      // フラットエディトリアル: 影なし、輪郭太く、文字濃く
      return {
        a: { fill: "#e0e7ff", stroke: "#312e81", strokeWidth: 3.5 },
        b: { fill: "#f1f5f9", stroke: "#1e293b", strokeWidth: 3 },
        c: { fill: "#fefce8", stroke: "#854d0e", strokeWidth: 3 },
        aText: "text-[15px] font-bold text-indigo-950",
        bText: "text-[14px] font-bold text-slate-900",
        cText: "text-[13px] font-bold text-yellow-950",
        lineMain: "#1e293b",
        lineSub: "#475569",
      };
  }
}

function FtaViewerCommon({ chart, style }: { chart: FtaChart; style: Style }) {
  const safe = chart ?? defaultFtaChart();
  const bNodes = safe.elements.slice(0, 8);
  const bCount = Math.max(1, bNodes.length);
  const maxActionsPerB = bNodes.reduce((max, b) => Math.max(max, b.actions.length), 0);

  // ---- 以下、元 FtaViewer と完全に同じ座標計算 ----
  const visionR = 80;
  const bR = 60;
  const cR = 48;
  const wedge = 360 / bCount;
  const itemsPerRing = 3;
  const ringCount = Math.max(1, Math.ceil(maxActionsPerB / itemsPerRing));
  const slotAngularStepDeg = wedge / itemsPerRing;
  const slotAngularStepRad = (slotAngularStepDeg * Math.PI) / 180;
  const minBRadiusBySpacing =
    bCount > 1 ? (bR + 8) / Math.sin((wedge * Math.PI) / 360) : 0;
  const bRadius = Math.max(visionR + bR + 22, 150, minBRadiusBySpacing);
  const edgeGap = 18;
  const minRingByCircle = (2 * cR + edgeGap) / (2 * Math.sin(slotAngularStepRad / 2));
  const minRingByB = bRadius + bR + cR + 22;
  const baseRingRadius = Math.max(minRingByCircle, minRingByB, 220);
  const ringStep = 2 * cR + 22;
  const cRingRadii = Array.from(
    { length: ringCount },
    (_, i) => baseRingRadius + i * ringStep,
  );
  const outerMost = cRingRadii[cRingRadii.length - 1]! + cR;
  const size = Math.ceil((outerMost + 40) * 2);
  const center = size / 2;

  function stable(n: number) {
    return Number(n.toFixed(4));
  }
  function polar(radius: number, angleDeg: number) {
    const r = (angleDeg * Math.PI) / 180;
    return {
      x: stable(center + radius * Math.cos(r)),
      y: stable(center + radius * Math.sin(r)),
    };
  }
  function labelText(text: string, locked: boolean) {
    if (locked) return "🔒 非公開";
    return text || "未入力";
  }

  const actionNodes = bNodes.flatMap((b, bi) => {
    const baseAngle = wedge * bi - 90;
    const actions = b.actions.slice(0, ringCount * itemsPerRing);
    return actions.map((c, ci) => {
      const ringIndex = Math.floor(ci / itemsPerRing);
      const slotIndex = ci % itemsPerRing;
      const itemsThisRing = Math.min(
        itemsPerRing,
        actions.length - ringIndex * itemsPerRing,
      );
      const ringR = cRingRadii[ringIndex] ?? cRingRadii[0]!;
      const offset =
        itemsThisRing <= 1
          ? 0
          : (slotIndex - (itemsThisRing - 1) / 2) * slotAngularStepDeg;
      const angle = baseAngle + offset;
      const pos = polar(ringR, angle);
      return { pos, parentAngle: baseAngle, action: c, ringIndex };
    });
  });
  // ---- ここまで完全同一 ----

  const filterAttr = style.shadow ? `url(#${style.shadow.id})` : undefined;

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto block"
        style={{ minWidth: Math.min(size, 720) }}
      >
        {style.shadow ? <defs>{style.shadow.def}</defs> : null}

        {bNodes.map((b, bi) => {
          const angle = wedge * bi - 90;
          const p = polar(bRadius, angle);
          return (
            <line
              key={`line-b-${b.id}`}
              x1={center}
              y1={center}
              x2={p.x}
              y2={p.y}
              stroke={style.lineMain}
              strokeWidth="2"
            />
          );
        })}

        {actionNodes.map((item, i) => {
          const p1 = polar(bRadius, item.parentAngle);
          return (
            <line
              key={`line-c-${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={item.pos.x}
              y2={item.pos.y}
              stroke={style.lineSub}
              strokeWidth="1.5"
            />
          );
        })}

        {bNodes.map((b, bi) => {
          const angle = wedge * bi - 90;
          const p = polar(bRadius, angle);
          const padding = 8;
          const inner = bR - padding;
          return (
            <g key={`b-${b.id}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r={bR}
                fill={style.b.fill}
                stroke={style.b.stroke}
                strokeWidth={style.b.strokeWidth}
                filter={filterAttr}
              />
              <foreignObject
                x={p.x - inner}
                y={p.y - inner}
                width={inner * 2}
                height={inner * 2}
              >
                <div
                  className={`flex h-full w-full items-center justify-center overflow-y-auto break-words text-center leading-snug ${style.bText}`}
                  style={{ scrollbarWidth: "thin" }}
                >
                  <span className="px-1">{labelText(b.text, b.locked)}</span>
                </div>
              </foreignObject>
            </g>
          );
        })}

        {actionNodes.map((item, i) => {
          const padding = 8;
          const inner = cR - padding;
          return (
            <g key={`c-${i}`}>
              <circle
                cx={item.pos.x}
                cy={item.pos.y}
                r={cR}
                fill={style.c.fill}
                stroke={style.c.stroke}
                strokeWidth={style.c.strokeWidth}
                filter={filterAttr}
              />
              <foreignObject
                x={item.pos.x - inner}
                y={item.pos.y - inner}
                width={inner * 2}
                height={inner * 2}
              >
                <div
                  className={`flex h-full w-full items-center justify-center overflow-y-auto break-words text-center leading-snug ${style.cText}`}
                  style={{ scrollbarWidth: "thin" }}
                >
                  <span className="px-1">{labelText(item.action.text, item.action.locked)}</span>
                </div>
              </foreignObject>
            </g>
          );
        })}

        <circle
          cx={center}
          cy={center}
          r={visionR}
          fill={style.a.fill}
          stroke={style.a.stroke}
          strokeWidth={style.a.strokeWidth}
          filter={filterAttr}
        />
        <foreignObject
          x={center - (visionR - 10)}
          y={center - (visionR - 10)}
          width={(visionR - 10) * 2}
          height={(visionR - 10) * 2}
        >
          <div
            className={`flex h-full w-full items-center justify-center overflow-y-auto break-words text-center leading-snug ${style.aText}`}
            style={{ scrollbarWidth: "thin" }}
          >
            <span className="px-1">{labelText(safe.vision.text, safe.vision.locked)}</span>
          </div>
        </foreignObject>
      </svg>
    </div>
  );
}

export function FtaViewerVariantA({ chart, variant }: { chart: FtaChart; variant?: Variant }) {
  return <FtaViewerCommon chart={chart} style={styleFor(variant ?? "A")} />;
}
export function FtaViewerVariantB({ chart }: { chart: FtaChart }) {
  return <FtaViewerCommon chart={chart} style={styleFor("B")} />;
}
export function FtaViewerVariantC({ chart }: { chart: FtaChart }) {
  return <FtaViewerCommon chart={chart} style={styleFor("C")} />;
}
export function FtaViewerVariantD({ chart }: { chart: FtaChart }) {
  return <FtaViewerCommon chart={chart} style={styleFor("D")} />;
}
