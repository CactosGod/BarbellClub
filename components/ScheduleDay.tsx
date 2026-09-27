"use client";

import Link from "next/link";
import SignupButton from "@/components/SignupButton";
import { formatDayLabel, formatTime } from "@/lib/schedule";
import type { SessionWithMeta } from "@/lib/types";

export function ScheduleDay({
  date,
  isToday,
  sessions,
  backHref,
  today,
}: {
  date: string;
  isToday: boolean;
  sessions: SessionWithMeta[];
  backHref: string;
  today: string;
}) {
  return (
    <section
      className={`rounded-lg border p-3 ${
        isToday
          ? "border-red/50 bg-charcoal-800"
          : "border-charcoal-700 bg-charcoal-800/50"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">
          {formatDayLabel(date)}
        </h2>
        {isToday && (
          <span className="text-xs font-medium uppercase tracking-wide text-red">
            Today
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-2">
        {sessions.map((s) => (
          <SessionCard key={s.id} s={s} backHref={backHref} today={today} />
        ))}
      </ul>
    </section>
  );
}

function SessionCard({
  s,
  backHref,
  today,
}: {
  s: SessionWithMeta;
  backHref: string;
  today: string;
}) {
  const capacityLabel =
    s.capacity != null ? `${s.signup_count}/${s.capacity}` : `${s.signup_count}`;
  const past = s.date < today;
  const scoreMissing = past && s.is_signed_up && !s.has_my_result;
  const showSignup = !past || !s.is_signed_up;

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-charcoal-700 bg-charcoal p-3">
      <Link
        href={`/session/${s.id}?back=${encodeURIComponent(backHref)}`}
        className="min-w-0 flex-1"
      >
        <div className="flex items-center gap-2">
          {s.start_time && (
            <span className="font-mono text-sm text-gold">
              {formatTime(s.start_time)}
            </span>
          )}
          <span className="truncate font-medium">{s.title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <span>{capacityLabel} in</span>
          {s.wod_hidden && <span className="text-neutral-500">· WOD hidden</span>}
          {s.is_full && !s.is_signed_up && !past && (
            <span className="text-red">· full</span>
          )}
          {scoreMissing && (
            <span className="text-orange">· score missing, please add</span>
          )}
        </div>
      </Link>
      {showSignup && (
        <SignupButton
          sessionId={s.id}
          isSignedUp={s.is_signed_up}
          isFull={s.is_full}
          past={past}
          size="sm"
        />
      )}
    </li>
  );
}
