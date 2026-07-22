import type { AttendanceRate } from "@/lib/attendance";

function Ring({
  rate,
  label,
}: {
  rate: AttendanceRate;
  label: string;
}) {
  const size = 112;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = rate.percent ?? 0;
  const offset = c - (pct / 100) * c;
  const display =
    rate.percent == null ? "—" : `${rate.percent}%`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#2e2e2e"
            strokeWidth={stroke}
          />
          {rate.percent != null && rate.percent > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#FFC20E"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="heading text-xl text-white">{display}</span>
        </div>
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-300">
        {label}
      </p>
      <p className="text-xs text-neutral-500">
        {rate.attended}/{rate.eligible} sessions
      </p>
    </div>
  );
}

export default function AttendanceGauges({
  last12,
  lifetime,
}: {
  last12: AttendanceRate;
  lifetime: AttendanceRate;
}) {
  return (
    <section className="mt-8">
      <h2 className="heading text-lg text-gold">Attendance</h2>
      <div className="mt-4 flex justify-around gap-4 rounded-lg border border-charcoal-700 bg-charcoal-800 p-4">
        <Ring rate={last12} label="12 months" />
        <Ring rate={lifetime} label="Lifetime" />
      </div>
    </section>
  );
}
