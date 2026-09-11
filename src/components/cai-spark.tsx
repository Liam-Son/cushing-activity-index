export function CaiSpark({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <p className="text-xs text-on-dark-muted">추이 표본 부족</p>;
  }
  const w = 320;
  const h = 100;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 8) + 4;
    const y = h - 16 - ((v - min) / span) * (h - 28);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(",");
  return (
    <svg className="h-24 w-full text-mint" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="CAI 재구성 추이">
      <path
        d={`M${pts.join(" L")} L ${w - 4},${h - 16} L 4,${h - 16} Z`}
        fill="currentColor"
        fillOpacity="0.08"
      />
      <polyline
        fill="none"
        points={pts.join(" ")}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <circle cx={last[0]} cy={last[1]} r="3.6" fill="currentColor" className="stroke-dark" strokeWidth="1.8" />
    </svg>
  );
}
