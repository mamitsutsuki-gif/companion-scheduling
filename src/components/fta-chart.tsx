"use client";

import { FtaChart, defaultFtaChart } from "@/lib/fta";

function lockIcon(locked: boolean) {
  return locked ? "🔒" : "🔓";
}

function lockButtonClass(locked: boolean) {
  return locked
    ? "rounded-md border border-amber-500 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900"
    : "rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700";
}

export function FtaEditor({
  chart,
  onChange,
}: {
  chart: FtaChart;
  onChange: (next: FtaChart) => void;
}) {
  const safe = chart ?? defaultFtaChart();
  const canAddElement = safe.elements.length < 8;

  function reorder<T>(arr: T[], from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
    const next = arr.slice();
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return arr;
    next.splice(to, 0, moved);
    return next;
  }

  function newId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function addElement() {
    if (!canAddElement) return;
    onChange({
      ...safe,
      elements: [
        ...safe.elements,
        {
          id: newId("b"),
          text: "",
          locked: false,
          actions: [],
        },
      ],
    });
  }

  function removeElement(index: number) {
    const next = safe.elements.filter((_, i) => i !== index);
    onChange({ ...safe, elements: next });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-indigo-300 bg-indigo-50 p-5">
        <label className="block text-base font-semibold text-indigo-900">中心（ありたい姿）</label>
        <div className="mt-2 flex items-start gap-2">
          <textarea
            value={safe.vision.text}
            onChange={(e) => onChange({ ...safe, vision: { ...safe.vision, text: e.target.value } })}
            rows={3}
            className="w-full rounded-md border border-indigo-200 bg-white px-3 py-2.5 text-base leading-relaxed"
          />
          <button
            type="button"
            className={lockButtonClass(safe.vision.locked)}
            onClick={() => onChange({ ...safe, vision: { ...safe.vision, locked: !safe.vision.locked } })}
            title="公開/非公開"
          >
            {lockIcon(safe.vision.locked)} {safe.vision.locked ? "非公開" : "公開"}
          </button>
        </div>
        <p className={`mt-2 text-sm font-medium ${safe.vision.locked ? "text-amber-800" : "text-emerald-700"}`}>
          {safe.vision.locked ? "この枠は他ユーザーに非公開です。" : "この枠は閲覧可能です。"}
        </p>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-zinc-900">要素(B)は最大8枠まで追加できます</p>
        <button
          type="button"
          onClick={addElement}
          disabled={!canAddElement}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          要素(B)を追加
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {safe.elements.map((b, bi) => (
          <section
            key={b.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-fta-b-index", String(bi));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData("application/x-fta-b-index"));
              if (!Number.isFinite(from)) return;
              onChange({ ...safe, elements: reorder(safe.elements, from, bi) });
            }}
            className="rounded-xl border border-zinc-200 bg-white p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <label className="block text-base font-semibold text-zinc-900">要素 {bi + 1}</label>
              <div className="flex items-center gap-2">
                <span className="cursor-grab rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
                  ⇅ 並び替え
                </span>
                <button
                  type="button"
                  onClick={() => removeElement(bi)}
                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-sm font-semibold text-red-700"
                >
                  削除
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-start gap-2">
              <textarea
                value={b.text}
                onChange={(e) => {
                  const elements = safe.elements.slice();
                  elements[bi] = { ...b, text: e.target.value };
                  onChange({ ...safe, elements });
                }}
                rows={3}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base leading-relaxed"
              />
              <button
                type="button"
                className={lockButtonClass(b.locked)}
                onClick={() => {
                  const elements = safe.elements.slice();
                  elements[bi] = { ...b, locked: !b.locked };
                  onChange({ ...safe, elements });
                }}
                title="公開/非公開"
              >
                {lockIcon(b.locked)} {b.locked ? "非公開" : "公開"}
              </button>
            </div>
            <p className={`mt-2 text-sm font-medium ${b.locked ? "text-amber-800" : "text-emerald-700"}`}>
              {b.locked ? "この要素は非公開です。" : "この要素は閲覧可能です。"}
            </p>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-zinc-600">アクション(C)は最大8枠まで追加できます</p>
              <button
                type="button"
                onClick={() => {
                  if (b.actions.length >= 8) return;
                  const elements = safe.elements.slice();
                  elements[bi] = {
                    ...b,
                    actions: [...b.actions, { id: newId("c"), text: "", locked: false }],
                  };
                  onChange({ ...safe, elements });
                }}
                disabled={b.actions.length >= 8}
                className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 disabled:opacity-50"
              >
                Cを追加
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {b.actions.map((c, ci) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-fta-c-index", String(ci));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("application/x-fta-c-index"));
                    if (!Number.isFinite(from)) return;
                    const elements = safe.elements.slice();
                    elements[bi] = { ...b, actions: reorder(b.actions, from, ci) };
                    onChange({ ...safe, elements });
                  }}
                  className="flex items-start gap-2"
                >
                  <textarea
                    value={c.text}
                    onChange={(e) => {
                      const elements = safe.elements.slice();
                      const actions = b.actions.slice();
                      actions[ci] = { ...c, text: e.target.value };
                      elements[bi] = { ...b, actions };
                      onChange({ ...safe, elements });
                    }}
                    rows={3}
                    className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-relaxed"
                    placeholder={`アクション ${ci + 1}`}
                  />
                  <button
                    type="button"
                    className={lockButtonClass(c.locked)}
                    onClick={() => {
                      const elements = safe.elements.slice();
                      const actions = b.actions.slice();
                      actions[ci] = { ...c, locked: !c.locked };
                      elements[bi] = { ...b, actions };
                      onChange({ ...safe, elements });
                    }}
                    title="公開/非公開"
                  >
                    {lockIcon(c.locked)}
                  </button>
                  <span className="cursor-grab rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
                    ⇅
                  </span>
                  <button
                    type="button"
                    className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-sm font-semibold text-red-700"
                    onClick={() => {
                      const elements = safe.elements.slice();
                      const actions = b.actions.slice().filter((_, i) => i !== ci);
                      elements[bi] = { ...b, actions };
                      onChange({ ...safe, elements });
                    }}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function FtaViewer({ chart }: { chart: FtaChart }) {
  const safe = chart ?? defaultFtaChart();
  const bNodes = safe.elements.slice(0, 8);
  const bCount = Math.max(1, bNodes.length);
  const maxActionsPerB = bNodes.reduce((max, b) => Math.max(max, b.actions.length), 0);

  // 基本サイズ。長文は overflow-y:auto でスクロール表示。
  const visionR = 80;
  const bR = 60;
  const cR = 48;
  const wedge = 360 / bCount;

  // 配置戦略: 「全体で同心リング」。1リングあたり itemsPerRing 個のCを各Bに配分し、
  // リング上の C は 360°を等間隔で割って並べる（= 隣りB境界でも同間隔）。
  // 1リング 3個までに抑えると 8 個でも 3 リング(3,3,2) で収まる。
  const itemsPerRing = 3;
  const ringCount = Math.max(1, Math.ceil(maxActionsPerB / itemsPerRing));

  // ring r の総スロット数 = bCount * itemsPerRing。各スロット同士は等角間隔。
  const slotAngularStepDeg = wedge / itemsPerRing; // = 360 / (bCount*itemsPerRing)
  const slotAngularStepRad = (slotAngularStepDeg * Math.PI) / 180;

  // C 円同士が重ならない最小半径: 弦長 = 2 r sin(step/2) ≥ 2cR + edgeGap
  const edgeGap = 18;
  const minRingByCircle = (2 * cR + edgeGap) / (2 * Math.sin(slotAngularStepRad / 2));
  const minRingByB = bR + cR + 30;
  const baseRingRadius = Math.max(minRingByCircle, minRingByB, 220);
  const ringStep = 2 * cR + 22; // 半径方向のリング間隔
  const cRingRadii = Array.from(
    { length: ringCount },
    (_, i) => baseRingRadius + i * ringStep,
  );

  // B の半径。同心リング配置で、隣 B 同士が重ならない最小値も担保。
  const minBRadiusBySpacing =
    bCount > 1 ? (bR + 8) / Math.sin((wedge * Math.PI) / 360) : 0;
  const bRadius = Math.max(visionR + bR + 22, 150, minBRadiusBySpacing);

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

  // 各 B に対して、自身の actions をリングごとに分けて配置する。
  // 同じリングに居る他 B の C と等角度間隔（slotAngularStepDeg）で並ぶため、
  // 隣り B 境界の Cどうしも常に同じ間隔（重なりが起きない）。
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

  return (
    <div className="space-y-4">
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-3">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="mx-auto block"
          style={{ minWidth: Math.min(size, 720) }}
        >
          {/* Bへの線（中心→B） */}
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
                stroke="#cbd5e1"
                strokeWidth="2"
              />
            );
          })}

          {/* Cへの線（B→C） */}
          {actionNodes.map((item, i) => {
            const p1 = polar(bRadius, item.parentAngle);
            return (
              <line
                key={`line-c-${i}`}
                x1={p1.x}
                y1={p1.y}
                x2={item.pos.x}
                y2={item.pos.y}
                stroke="#e2e8f0"
                strokeWidth="1.5"
              />
            );
          })}

          {/* B 円 */}
          {bNodes.map((b, bi) => {
            const angle = wedge * bi - 90;
            const p = polar(bRadius, angle);
            const padding = 8;
            const inner = bR - padding;
            return (
              <g key={`b-${b.id}`}>
                <circle cx={p.x} cy={p.y} r={bR} fill="#f8fafc" stroke="#94a3b8" />
                <foreignObject x={p.x - inner} y={p.y - inner} width={inner * 2} height={inner * 2}>
                  <div
                    className="flex h-full w-full items-center justify-center overflow-y-auto break-words text-center text-[13px] font-medium leading-snug text-slate-800"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    <span className="px-1">{labelText(b.text, b.locked)}</span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* C 円 */}
          {actionNodes.map((item, i) => {
            const padding = 8;
            const inner = cR - padding;
            return (
              <g key={`c-${i}`}>
                <circle cx={item.pos.x} cy={item.pos.y} r={cR} fill="#fefce8" stroke="#f59e0b" />
                <foreignObject
                  x={item.pos.x - inner}
                  y={item.pos.y - inner}
                  width={inner * 2}
                  height={inner * 2}
                >
                  <div
                    className="flex h-full w-full items-center justify-center overflow-y-auto break-words text-center text-[12px] font-medium leading-snug text-amber-900"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    <span className="px-1">{labelText(item.action.text, item.action.locked)}</span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* 中心 (Vision/A) */}
          <circle cx={center} cy={center} r={visionR} fill="#e0e7ff" stroke="#4f46e5" strokeWidth="2.5" />
          <foreignObject
            x={center - (visionR - 10)}
            y={center - (visionR - 10)}
            width={(visionR - 10) * 2}
            height={(visionR - 10) * 2}
          >
            <div
              className="flex h-full w-full items-center justify-center overflow-y-auto break-words text-center text-[14px] font-semibold leading-snug text-indigo-900"
              style={{ scrollbarWidth: "thin" }}
            >
              <span className="px-1">{labelText(safe.vision.text, safe.vision.locked)}</span>
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>
  );
}
