function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function CaiGauge({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const theta = Math.PI * (1 - s / 100);
  const cx = 220;
  const cy = 178;
  const r = 128;
  const x2 = r2(cx + r * Math.cos(theta));
  const y2 = r2(cy - r * Math.sin(theta));

  return (
    <div
      className="relative mx-auto aspect-[440/252] w-full max-w-md"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number(s.toFixed(1))}
      aria-valuetext={`${s.toFixed(1)}점 / 100점, 활동 점수`}
    >
      <svg className="h-auto w-full overflow-visible" viewBox="0 -28 440 252" aria-hidden>
        <g fill="none" strokeLinecap="butt" strokeWidth="17">
          <path d="M72.041,174.513 A148,148 0 0 1 98.249,93.853" stroke="#486765" />
          <path d="M102.348,88.211 A148,148 0 0 1 170.962,38.360" stroke="#5c8881" />
          <path d="M177.594,36.205 A148,148 0 0 1 262.406,36.205" stroke="#79aaa0" />
          <path d="M269.038,38.360 A148,148 0 0 1 337.652,88.211" stroke="#94cfbb" />
          <path d="M341.751,93.853 A148,148 0 0 1 367.959,174.513" stroke="#b5efd5" />
        </g>
        <g className="fill-none" stroke="#7ea59c">
          {Array.from({ length: 21 }, (_, i) => {
            const a = Math.PI * (1 - i / 20);
            const x1 = r2(cx + 148 * Math.cos(a));
            const y1 = r2(cy - 148 * Math.sin(a));
            const x0 = r2(cx + 153 * Math.cos(a));
            const y0 = r2(cy - 153 * Math.sin(a));
            return <line key={i} x1={x1} x2={x0} y1={y1} y2={y0} />;
          })}
        </g>
        <g fill="#b9d3cb" fontFamily="ui-monospace, monospace" fontSize="11" textAnchor="middle">
          <text x="31" y="182">0</text>
          <text x="86" y="48">25</text>
          <text x="220" y="-7">50</text>
          <text x="354" y="48">75</text>
          <text x="409" y="182">100</text>
        </g>
        <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#eefcf6" strokeLinecap="round" strokeWidth="3.5" />
        <circle cx={cx} cy={cy} r="8" fill="#b5efd5" stroke="#163b3b" strokeWidth="4" />
        <text fill="#aac8bd" fontSize="11" textAnchor="middle" x="57" y="204">낮음</text>
        <text fill="#aac8bd" fontSize="11" textAnchor="middle" x="383" y="204">높음</text>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[41%] flex items-baseline justify-center gap-1.5">
        <output className="font-mono text-6xl font-medium tracking-tight text-mint">{s.toFixed(1)}</output>
        <span className="font-mono text-xs text-on-dark-muted">/ 100</span>
      </div>
    </div>
  );
}
