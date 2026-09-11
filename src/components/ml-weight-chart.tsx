import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExplainRow } from "@/lib/cfam-engine";

export function MlWeightChart({ rows }: { rows: ExplainRow[] }) {
  const data = rows.map((r) => ({
    name: r.name.replace("091-", ""),
    규칙: +(r.ruleW * 100).toFixed(1),
    Ridge: +(r.ridgeW * 100).toFixed(1),
    MLP: +(r.mlpW * 100).toFixed(1),
    최종: +(r.usedW * 100).toFixed(1),
  }));

  return (
    <div className="mt-3 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 45]}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
            unit="%"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tick={{ fill: "var(--color-muted)", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-line)",
              color: "var(--color-ink)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }} />
          <Bar dataKey="규칙" fill="var(--color-line)" radius={2} />
          <Bar dataKey="Ridge" fill="#b7d6cb" radius={2} />
          <Bar dataKey="MLP" fill="var(--color-muted)" radius={2} />
          <Bar dataKey="최종" fill="var(--color-teal)" radius={2} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
