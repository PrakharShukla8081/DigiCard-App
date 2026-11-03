"use client";

import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendSeries = { key: string; label: string; color: string; area?: boolean };

const shortDay = (d: string) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** Daily trend chart. Colours come from CSS tokens so it reads in light and dark themes. */
export function TrendChart({ data, series, height = 240 }: { data: Record<string, number | string>[]; series: TrendSeries[]; height?: number }) {
  if (!data.length) return <div className="grid h-40 place-items-center text-[13px] text-muted">No data for this period yet.</div>;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity={s.area ? 0.22 : 0} />
                <stop offset="1" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip
            labelFormatter={(l) => shortDay(String(l))}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--fg)", fontSize: 12 }}
            itemStyle={{ color: "var(--fg)" }}
          />
          {series.map((s) =>
            s.area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.2} fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 4 }} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            )
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ series }: { series: TrendSeries[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-[12px] text-muted">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[3px] w-2.5 rounded" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
