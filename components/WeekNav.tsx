import Link from "next/link";
import { formatDayLabel } from "@/lib/schedule";

// Prev / this-week / next navigation for the week view. Pure links that carry the
// week offset in the query string, so the schedule stays server-rendered.
export default function WeekNav({
  offset,
  dates,
}: {
  offset: number;
  dates: string[];
}) {
  const href = (o: number) => (o === 0 ? "/" : `/?week=${o}`);
  const range = `${formatDayLabel(dates[0])} – ${formatDayLabel(dates[6])}`;

  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href={href(offset - 1)}
        className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
        aria-label="Previous week"
      >
        ← Prev
      </Link>

      <div className="text-center">
        <p className="text-sm font-medium">{range}</p>
        {offset !== 0 && (
          <Link href={href(0)} className="text-xs text-gold hover:underline">
            Back to this week
          </Link>
        )}
      </div>

      <Link
        href={href(offset + 1)}
        className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
        aria-label="Next week"
      >
        Next →
      </Link>
    </div>
  );
}
