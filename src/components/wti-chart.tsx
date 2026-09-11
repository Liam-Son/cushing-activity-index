import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WtiPoint } from "@/lib/get-wti";

function weekLabel(t: number): string {
  const d = new Date(t);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function WtiChart({ points }: { points: WtiPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-lg bg-bg px-4 text-sm text-muted">
        WTI 시계열을 아직 받지 못했습니다.
      </div>
    );
  }
  const data = points.map((p) => ({ t: p.t, c: +p.c.toFixed(2), label: weekLabel(p.t) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            tickFormatter={(v: number) => v.toFixed(0)}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-dark)",
              border: "none",
              borderRadius: 8,
              color: "var(--color-on-dark)",
              fontSize: 12,
            }}
            formatter={(v) => [`$${Number(v).toFixed(2)}`, "WTI"]}
            labelFormatter={(_, payload) => {
              const t = payload?.[0]?.payload?.t as number | undefined;
              if (!t) return "";
              const d = new Date(t);
              return `${d.getUTCFullYear()}.${weekLabel(t)}`;
            }}
          />
          <Line
            type="monotone"
            dataKey="c"
            stroke="var(--color-teal)"
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--color-teal)", stroke: "#fff", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
