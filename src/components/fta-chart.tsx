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
    <div className="space-y-4">
      <section className="rounded-xl border border-indigo-300 bg-indigo-50 p-4">
        <label className="block text-sm font-semibold text-indigo-900">中心（ありたい姿）</label>
        <div className="mt-2 flex items-start gap-2">
          <textarea
            value={safe.vision.text}
            onChange={(e) => onChange({ ...safe, vision: { ...safe.vision, text: e.target.value } })}
            rows={2}
            className="w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm"
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
        <p className={`mt-2 text-xs font-medium ${safe.vision.locked ? "text-amber-800" : "text-emerald-700"}`}>
          {safe.vision.locked ? "この枠は他ユーザーに非公開です。" : "この枠は閲覧可能です。"}
        </p>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900">要素(B)は最大8枠まで追加できます</p>
        <button
          type="button"
          onClick={addElement}
          disabled={!canAddElement}
          className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-900 disabled:opacity-50"
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
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold text-zinc-900">要素 {bi + 1}</label>
              <div className="flex items-center gap-2">
                <span className="cursor-grab rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600">
                  ⇅ 並び替え
                </span>
                <button
                  type="button"
                  onClick={() => removeElement(bi)}
                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
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
                rows={2}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
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
            <p className={`mt-2 text-xs font-medium ${b.locked ? "text-amber-800" : "text-emerald-700"}`}>
              {b.locked ? "この要素は非公開です。" : "この要素は閲覧可能です。"}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-zinc-500">アクション(C)は最大8枠まで追加できます</p>
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
                className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 disabled:opacity-50"
              >
                Cを追加
              </button>
            </div>
            <div className="mt-3 space-y-2">
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
                    rows={2}
                    className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs"
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
                  <span className="cursor-grab rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600">
                    ⇅
                  </span>
                  <button
                    type="button"
                    className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
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
  const size = 760;
  const center = size / 2;
  const bRadius = 165;
  const cRadius = 300;
  const bNodes = safe.elements.slice(0, 8);

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
    const baseAngle = (360 / Math.max(1, bNodes.length)) * bi - 90;
    const actions = b.actions.slice(0, 8);
    return actions.map((c, ci) => {
      const spread = actions.length <= 1 ? 0 : (ci - (actions.length - 1) / 2) * 16;
      const pos = polar(cRadius, baseAngle + spread);
      return { pos, parentAngle: baseAngle, action: c };
    });
  });

  return (
    <div className="space-y-4">
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-3">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto block min-w-[720px]">
          {bNodes.map((b, bi) => {
            const angle = (360 / Math.max(1, bNodes.length)) * bi - 90;
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

          {bNodes.map((b, bi) => {
            const angle = (360 / Math.max(1, bNodes.length)) * bi - 90;
            const p = polar(bRadius, angle);
            return (
              <g key={`b-${b.id}`}>
                <circle cx={p.x} cy={p.y} r="52" fill="#f8fafc" stroke="#94a3b8" />
                <foreignObject x={p.x - 46} y={p.y - 28} width="92" height="56">
                  <div className="flex h-full items-center justify-center text-center text-[11px] font-medium leading-tight text-slate-700">
                    {labelText(b.text, b.locked)}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {actionNodes.map((item, i) => (
            <g key={`c-${i}`}>
              <circle cx={item.pos.x} cy={item.pos.y} r="40" fill="#fefce8" stroke="#f59e0b" />
              <foreignObject x={item.pos.x - 35} y={item.pos.y - 22} width="70" height="44">
                <div className="flex h-full items-center justify-center text-center text-[10px] font-medium leading-tight text-amber-900">
                  {labelText(item.action.text, item.action.locked)}
                </div>
              </foreignObject>
            </g>
          ))}

          <circle cx={center} cy={center} r="68" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="2.5" />
          <foreignObject x={center - 58} y={center - 32} width="116" height="64">
            <div className="flex h-full items-center justify-center text-center text-xs font-semibold leading-tight text-indigo-900">
              {labelText(safe.vision.text, safe.vision.locked)}
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>
  );
}
