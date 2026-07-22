"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MemberSeries } from "@/lib/attendance";

// Club-ish palette (no purple). Cycles if more members than colors.
const STROKES = [
  "#FFC20E", // gold
  "#E31E24", // red
  "#F7941D", // orange
  "#E4E4E4", // light
  "#8B9BB4", // steel
  "#3FA266", // green
  "#C4A57B", // sand
  "#6AABE9", // blue
  "#FC6B83", // rose
  "#2DD4BF", // teal
  "#FBBF24", // amber
  "#94A3B8", // slate
];

function shortMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${names[Number(m) - 1]} ${y.slice(2)}`;
}

export default function AttendanceTimeline({
  months,
  series,
}: {
  months: string[];
  series: MemberSeries[];
}) {
  if (series.length === 0 || months.length === 0) {
    return (
      <p className="mt-2 text-sm text-neutral-500">
        No attendance data in this range yet.
      </p>
    );
  }

  const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

  const data = months.map((mk) => {
    const row: Record<string, string | number> = {
      month: shortMonth(mk),
      key: mk,
    };
    for (const s of series) {
      row[s.profile_id] = s.months[mk] ?? 0;
    }
    return row;
  });

  const labelById = new Map(
    series.map((s) => [s.profile_id, firstName(s.name)]),
  );

  return (
    <div className="mt-3 w-full overflow-x-auto">
      <div className="min-w-[320px]" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          >
            <CartesianGrid stroke="#2e2e2e" strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              tick={{ fill: "#a3a3a3", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#2e2e2e" }}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "#a3a3a3", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#2e2e2e" }}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "#232323",
                border: "1px solid #2e2e2e",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#e5e5e5" }}
              formatter={(value, name) => {
                const label =
                  labelById.get(String(name)) ?? firstName(String(name));
                return [value, label];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value) =>
                labelById.get(String(value)) ?? firstName(String(value))
              }
            />
            {series.map((s, i) => (
              <Line
                key={s.profile_id}
                type="monotone"
                dataKey={s.profile_id}
                name={s.profile_id}
                stroke={STROKES[i % STROKES.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
