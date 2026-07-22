import { redirect } from "next/navigation";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
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

const PAGE_SIZE = 20;

// Attach signup counts + whether the viewer is signed up, in one query.
async function withMeta(
  supabase: SupabaseClient,
  sessions: Session[],
  meId: string,
  staff: boolean,
): Promise<SessionWithMeta[]> {
  const ids = sessions.map((s) => s.id);
  const counts = new Map<number, number>();
  const mine = new Set<number>();
  if (ids.length) {
    const { data } = await supabase
      .from("signups")
      .select("session_id, profile_id")
      .in("session_id", ids);
    for (const s of data ?? []) {
      counts.set(s.session_id, (counts.get(s.session_id) ?? 0) + 1);
      if (s.profile_id === meId) mine.add(s.session_id);
    }
  }
  return sessions.map((s) =>
    decorateSession(s, {
      signupCount: counts.get(s.id) ?? 0,
      isSignedUp: mine.has(s.id),
      isStaff: staff,
    }),
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; page?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/pending");

  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "week";
  const today = clubToday();
  const staff = isStaff(me.role);
  const supabase = await createClient();

  // Each branch produces the day groups to render, the nav element, and the
  // `back` href session cards link with so returning lands here.
  let groups: { date: string; sessions: SessionWithMeta[] }[];
  let nav: React.ReactNode;
  let backHref: string;

  if (view === "list") {
    const page = Math.max(0, Math.trunc(Number(sp.page)) || 0);
    // Fetch one extra to know whether an older page exists.
    const { data: rows } = await supabase
      .from("sessions")
      .select("*")
      .order("date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    const all = (rows ?? []) as Session[];
    const hasOlder = all.length > PAGE_SIZE;
    const sessions = await withMeta(supabase, all.slice(0, PAGE_SIZE), me.id, staff);

    const byDate = new Map<string, SessionWithMeta[]>();
    for (const s of sessions) {
      const list = byDate.get(s.date) ?? [];
      list.push(s);
      byDate.set(s.date, list);
    }
    groups = [...byDate.entries()].map(([date, ss]) => ({ date, sessions: ss }));
    backHref = `/?view=list&page=${page}`;
    nav = <ListNav page={page} hasOlder={hasOlder} />;
  } else {
    const offset = Number.isInteger(Number(sp.week)) ? Number(sp.week) : 0;
    const dates = weekDates(offset);
    const { data: rows } = await supabase
      .from("sessions")
      .select("*")
      .gte("date", dates[0])
      .lte("date", dates[6])
      .order("date")
      .order("start_time");
    const sessions = await withMeta(supabase, (rows ?? []) as Session[], me.id, staff);

    const byDate = new Map<string, SessionWithMeta[]>();
    for (const s of sessions) {
      const list = byDate.get(s.date) ?? [];
      list.push(s);
      byDate.set(s.date, list);
    }
    groups = dates.map((date) => ({ date, sessions: byDate.get(date) ?? [] }));
    backHref = offset === 0 ? "/" : `/?week=${offset}`;
    nav = <WeekNav offset={offset} dates={dates} />;
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
          <ViewToggle view={view} />
        </div>

        <div className="mt-4">{nav}</div>

        <div className="mt-6 space-y-3">
          {view === "list" && groups.length === 0 ? (
            <p className="text-sm text-neutral-600">No sessions here.</p>
          ) : (
            groups.map((g) => (
              <DayRow
                key={g.date}
                date={g.date}
                isToday={g.date === today}
                sessions={g.sessions}
                backHref={backHref}
              />
            ))
          )}
        </div>
      </main>
    </>
  );
}

function ViewToggle({ view }: { view: "week" | "list" }) {
  const item = (active: boolean) =>
    `rounded px-3 py-1 ${active ? "bg-charcoal-700 text-white" : "text-neutral-400 hover:text-white"}`;
  return (
    <div className="inline-flex rounded-md border border-charcoal-700 p-0.5 text-sm">
      <Link href="/" className={item(view === "week")}>
        Week
      </Link>
      <Link href="/?view=list" className={item(view === "list")}>
        Workouts only
      </Link>
    </div>
  );
}

function ListNav({ page, hasOlder }: { page: number; hasOlder: boolean }) {
  const href = (p: number) => (p === 0 ? "/?view=list" : `/?view=list&page=${p}`);
  return (
    <div className="flex items-center justify-between gap-3">
      {page > 0 ? (
        <Link
          href={href(page - 1)}
          className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
        >
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      {hasOlder ? (
        <Link
          href={href(page + 1)}
          className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500"
        >
          Older →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

function DayRow({
  date,
  isToday,
  sessions,
  backHref,
}: {
  date: string;
  isToday: boolean;
  sessions: SessionWithMeta[];
  backHref: string;
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
            <SessionCard key={s.id} s={s} backHref={backHref} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SessionCard({ s, backHref }: { s: SessionWithMeta; backHref: string }) {
  const capacityLabel =
    s.capacity != null ? `${s.signup_count}/${s.capacity}` : `${s.signup_count}`;

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
