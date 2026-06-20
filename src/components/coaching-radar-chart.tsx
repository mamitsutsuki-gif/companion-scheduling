"use client";

type RadarSeries = {
  label: string;
  color: string;
  values: Array<number | null>;
};

export function CoachingRadarChart({
  labels,
  series,
  maxLevel = 7,
  size = 280,
}: {
  labels: string[];
  series: RadarSeries[];
  maxLevel?: number;
  size?: number;
}) {
  if (labels.length === 0) {
    return <p className="text-sm text-slate-500">表示するデータがありません。</p>;
  }

  const center = size / 2;
  const radius = size * 0.34;
  const angleStep = (Math.PI * 2) / labels.length;

  function pointAt(index: number, value: number) {
    const angle = -Math.PI / 2 + index * angleStep;
    const r = (value / maxLevel) * radius;
    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
    };
  }

  function polygonPath(values: Array<number | null>) {
    const pts = values.map((v, i) => {
      const val = v ?? 0;
      const p = pointAt(i, val);
      return `${p.x},${p.y}`;
    });
    return `M ${pts.join(" L ")} Z`;
  }

  const gridLevels = Array.from({ length: maxLevel }, (_, i) => i + 1);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[320px]" role="img">
      {gridLevels.map((level) => {
        const pts = labels
          .map((_, i) => {
            const p = pointAt(i, level);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={level}
            points={pts}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={level === maxLevel ? 1.2 : 0.8}
          />
        );
      })}
      {labels.map((label, i) => {
        const outer = pointAt(i, maxLevel);
        const text = pointAt(i, maxLevel + 0.55);
        return (
          <g key={label}>
            <line x1={center} y1={center} x2={outer.x} y2={outer.y} stroke="#cbd5e1" strokeWidth={0.8} />
            <text
              x={text.x}
              y={text.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-600 text-[9px]"
            >
              {label.length > 6 ? `${label.slice(0, 5)}…` : label}
            </text>
          </g>
        );
      })}
      {series.map((s) => (
        <path
          key={s.label}
          d={polygonPath(s.values)}
          fill={s.color}
          fillOpacity={0.18}
          stroke={s.color}
          strokeWidth={2}
        />
      ))}
      <text x={center} y={16} textAnchor="middle" className="fill-slate-500 text-[10px]">
        {maxLevel}点満点
      </text>
    </svg>
  );
}
