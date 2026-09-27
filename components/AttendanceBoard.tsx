import type { AttendanceRank, HalfWindow } from "@/lib/attendance";

const PREVIEW = 10;

export default function AttendanceBoard({
  half,
  ranks,
}: {
  half: HalfWindow;
  ranks: AttendanceRank[];
}) {
  const leader = ranks[0];
  const preview = ranks.slice(0, PREVIEW);
  const rest = ranks.slice(PREVIEW);

  return (
    <section className="mt-6 rounded-lg border border-charcoal-700 bg-charcoal-800 p-4">
      <h2 className="heading text-lg text-gold">{half.label}</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        Sessions attended this half, through today.
      </p>

      {!leader ? (
        <p className="mt-4 text-sm text-neutral-500">
          No sessions attended this half yet.
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-center gap-4">
            <Avatar name={leader.name} photo={leader.photoUrl} large />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{leader.name}</p>
              <p className="font-mono text-5xl leading-none tracking-tight text-white">
                {leader.count}
              </p>
              <p className="mt-1 text-[11px] font-medium tracking-[0.2em] text-neutral-500">
                SESSIONS
              </p>
            </div>
          </div>

          <ol className="mt-5 divide-y divide-charcoal-700 border-t border-charcoal-700">
            {preview.map((row) => (
              <RankRow key={row.profileId} row={row} />
            ))}
          </ol>

          {rest.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer py-2 text-sm text-gold">
                All
              </summary>
              <ol className="divide-y divide-charcoal-700 border-t border-charcoal-700">
                {rest.map((row) => (
                  <RankRow key={row.profileId} row={row} />
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function RankRow({ row }: { row: AttendanceRank }) {
  const place = row.tied ? `T${row.place}.` : `${row.place}.`;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-9 shrink-0 font-mono text-sm text-gold">{place}</span>
        <Avatar name={row.name} photo={row.photoUrl} />
        <span className="truncate text-sm font-medium">{row.name}</span>
      </div>
      <span className="font-mono text-sm tabular-nums">{row.count}</span>
    </li>
  );
}

function Avatar({
  name,
  photo,
  large = false,
}: {
  name: string;
  photo: string | null;
  large?: boolean;
}) {
  const size = large ? "h-20 w-20 text-2xl" : "h-7 w-7 text-xs";
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photo}
        alt=""
        className={`${size} shrink-0 rounded-full object-cover`}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-charcoal-700 font-medium text-neutral-300`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
