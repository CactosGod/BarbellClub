import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import WeekNav from "@/components/WeekNav";
import SignupButton from "@/components/SignupButton";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isStaff, type Session, type SessionWithMeta } from "@/lib/types";
import {
  clubToday,
  decorateSession,
  formatDayLabel,
  formatTime,
  weekDates,
} from "@/lib/schedule";

// Home = the week-view schedule. Members see the current week (Mon–Sun), tap a
// session to sign up or open its detail page.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/pending");

  const { week } = await searchParams;
  const offset = Number.isInteger(Number(week)) ? Number(week) : 0;
  const dates = weekDates(offset);
  const today = clubToday();
  const staff = isStaff(me.role);

  const supabase = await createClient();
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("*")
    .gte("date", dates[0])
    .lte("date", dates[6])
    .order("date")
    .order("start_time");
  const sessions = (sessionRows ?? []) as Session[];

  // Signup counts + which sessions I'm in, in one query over the week's sessions.
  const ids = sessions.map((s) => s.id);
  const counts = new Map<number, number>();
  const mine = new Set<number>();
  if (ids.length) {
    const { data: signups } = await supabase
      .from("signups")
      .select("session_id, profile_id")
      .in("session_id", ids);
    for (const s of signups ?? []) {
      counts.set(s.session_id, (counts.get(s.session_id) ?? 0) + 1);
      if (s.profile_id === me.id) mine.add(s.session_id);
    }
  }

  const byDate = new Map<string, SessionWithMeta[]>();
  for (const s of sessions) {
    const decorated = decorateSession(s, {
      signupCount: counts.get(s.id) ?? 0,
      isSignedUp: mine.has(s.id),
      isStaff: staff,
    });
    const list = byDate.get(s.date) ?? [];
    list.push(decorated);
    byDate.set(s.date, list);
  }

  return (
    <>
      <Header profile={me} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="heading text-3xl">Schedule</h1>
          {staff && (
            <Link
              href="/coach"
              className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-gold hover:text-gold"
            >
              Manage
            </Link>
          )}
        </div>

        <div className="mt-4">
          <WeekNav offset={offset} dates={dates} />
        </div>

        <div className="mt-6 space-y-3">
          {dates.map((date) => (
            <DayRow
              key={date}
              date={date}
              isToday={date === today}
              sessions={byDate.get(date) ?? []}
            />
          ))}
        </div>
      </main>
    </>
  );
}

function DayRow({
  date,
  isToday,
  sessions,
}: {
  date: string;
  isToday: boolean;
  sessions: SessionWithMeta[];
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

      {sessions.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">No session</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {sessions.map((s) => (
            <SessionCard key={s.id} s={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionCard({ s }: { s: SessionWithMeta }) {
  const capacityLabel =
    s.capacity != null ? `${s.signup_count}/${s.capacity}` : `${s.signup_count}`;

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-charcoal-700 bg-charcoal p-3">
      <Link href={`/session/${s.id}`} className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {s.start_time && (
            <span className="font-mono text-sm text-gold">
              {formatTime(s.start_time)}
            </span>
          )}
          <span className="truncate font-medium">{s.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
          <span>{capacityLabel} in</span>
          {s.wod_hidden && <span className="text-neutral-500">· WOD hidden</span>}
          {s.is_full && !s.is_signed_up && (
            <span className="text-red">· full</span>
          )}
        </div>
      </Link>
      <SignupButton
        sessionId={s.id}
        isSignedUp={s.is_signed_up}
        isFull={s.is_full}
        size="sm"
      />
    </li>
  );
}
