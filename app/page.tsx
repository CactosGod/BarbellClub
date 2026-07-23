import { redirect } from "next/navigation";
import Link from "next/link";
import AllWorkoutsFeed from "@/components/AllWorkoutsFeed";
import Header from "@/components/Header";
import { ScheduleDay } from "@/components/ScheduleDay";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  fetchWorkoutsPage,
  groupByDate,
  withMeta,
} from "@/lib/schedule-feed";
import { clubToday } from "@/lib/schedule";
import { isStaff, type Session } from "@/lib/types";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/pending");

  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "upcoming";
  const today = clubToday();
  const staff = isStaff(me.role);

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

        <div className="mt-6">
          {view === "list" ? (
            <AllWorkoutsList today={today} meId={me.id} staff={staff} />
          ) : (
            <UpcomingList today={today} meId={me.id} staff={staff} />
          )}
        </div>
      </main>
    </>
  );
}

async function UpcomingList({
  today,
  meId,
  staff,
}: {
  today: string;
  meId: string;
  staff: boolean;
}) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("sessions")
    .select("*")
    .gte("date", today)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  const sessions = await withMeta(
    supabase,
    (rows ?? []) as Session[],
    meId,
    staff,
  );
  const groups = groupByDate(sessions);

  if (groups.length === 0) {
    return <p className="text-sm text-neutral-600">No upcoming sessions.</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <ScheduleDay
          key={g.date}
          date={g.date}
          isToday={g.date === today}
          sessions={g.sessions}
          backHref="/"
          today={today}
        />
      ))}
    </div>
  );
}

async function AllWorkoutsList({
  today,
  meId,
  staff,
}: {
  today: string;
  meId: string;
  staff: boolean;
}) {
  const { groups, hasMore } = await fetchWorkoutsPage(0, meId, staff);
  return (
    <AllWorkoutsFeed
      initialGroups={groups}
      initialHasMore={hasMore}
      today={today}
    />
  );
}

function ViewToggle({ view }: { view: "upcoming" | "list" }) {
  const item = (active: boolean) =>
    `rounded px-3 py-1 ${active ? "bg-charcoal-700 text-white" : "text-neutral-400 hover:text-white"}`;
  return (
    <div className="inline-flex rounded-md border border-charcoal-700 p-0.5 text-sm">
      <Link href="/" className={item(view === "upcoming")}>
        Upcoming
      </Link>
      <Link href="/?view=list" className={item(view === "list")}>
        All workouts
      </Link>
    </div>
  );
}
