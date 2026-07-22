import { redirect } from "next/navigation";
import Header from "@/components/Header";
import AttendanceTimeline from "@/components/AttendanceTimeline";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { lowerIsBetter } from "@/lib/pb";
import { clubToday } from "@/lib/schedule";
import {
  buildMonthlyAttendance,
  monthKey,
  monthKeysInclusive,
  rolling12Start,
  unionAttendance,
  type AttendanceEvent,
} from "@/lib/attendance";
import type {
  Benchmark,
  LeaderboardEntry,
  Movement,
  ScoreType,
} from "@/lib/types";

type MemberJoin = { name: string; photo_url: string | null } | null;
type PbJoinRow = {
  profile_id: string;
  value: number | null;
  value_text: string | null;
  achieved_on: string | null;
  profiles: MemberJoin;
};

type Selected = {
  key: string; // "movement:6" | "benchmark:3"
  kind: "movement" | "benchmark";
  id: number;
  name: string;
  scoreType: ScoreType;
  col: "movement_id" | "benchmark_id";
};

function resolveItem(
  raw: string | undefined,
  movements: Movement[],
  benchmarks: Benchmark[],
): Selected | null {
  if (raw?.startsWith("movement:")) {
    const id = Number(raw.slice(9));
    const m = movements.find((x) => x.id === id);
    if (m)
      return {
        key: raw,
        kind: "movement",
        id,
        name: m.name,
        scoreType: "load",
        col: "movement_id",
      };
  }
  if (raw?.startsWith("benchmark:")) {
    const id = Number(raw.slice(10));
    const b = benchmarks.find((x) => x.id === id);
    if (b)
      return {
        key: raw,
        kind: "benchmark",
        id,
        name: b.name,
        scoreType: b.score_type,
        col: "benchmark_id",
      };
  }
  return null;
}

const medal = (i: number) =>
  i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; range?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/pending");

  const { item, range: rangeRaw } = await searchParams;
  const rangeAll = rangeRaw === "all";
  const today = clubToday();
  const rangeStart = rangeAll ? "2000-01-01" : rolling12Start(today);

  const supabase = await createClient();
  const [
    { data: movementRows },
    { data: benchmarkRows },
    { data: sessionRows },
    { data: resultRows },
    { data: signupRows },
    { data: profileRows },
  ] = await Promise.all([
    supabase.from("movements").select("*").order("name"),
    supabase.from("benchmarks").select("*").order("name"),
    supabase
      .from("sessions")
      .select("id, date")
      .gte("date", rangeStart)
      .lte("date", today)
      .order("date"),
    supabase
      .from("results")
      .select("profile_id, session_id, sessions!inner(date)")
      .not("profile_id", "is", null)
      .gte("sessions.date", rangeStart)
      .lte("sessions.date", today),
    supabase
      .from("signups")
      .select("profile_id, session_id, sessions!inner(date)")
      .gte("sessions.date", rangeStart)
      .lte("sessions.date", today),
    supabase.from("profiles").select("id, name").eq("status", "active"),
  ]);

  const movements = (movementRows ?? []) as Movement[];
  const benchmarks = (benchmarkRows ?? []) as Benchmark[];

  type JoinDate = { date: string };
  type AttRow = {
    profile_id: string;
    session_id: number;
    sessions: JoinDate | JoinDate[] | null;
  };

  const sessionDate = (s: AttRow["sessions"]): string | null => {
    if (!s) return null;
    return Array.isArray(s) ? (s[0]?.date ?? null) : s.date;
  };

  const fromResults: AttendanceEvent[] = ((resultRows ?? []) as AttRow[])
    .map((r) => {
      const date = sessionDate(r.sessions);
      if (!date || !r.profile_id) return null;
      return {
        profile_id: r.profile_id,
        session_id: r.session_id,
        date,
      };
    })
    .filter((x): x is AttendanceEvent => x != null);

  const fromSignups: AttendanceEvent[] = ((signupRows ?? []) as AttRow[])
    .map((r) => {
      const date = sessionDate(r.sessions);
      if (!date || !r.profile_id) return null;
      return {
        profile_id: r.profile_id,
        session_id: r.session_id,
        date,
      };
    })
    .filter((x): x is AttendanceEvent => x != null);

  const events = unionAttendance(fromResults, fromSignups);
  const names = new Map(
    ((profileRows ?? []) as { id: string; name: string }[]).map((p) => [
      p.id,
      p.name,
    ]),
  );

  // Month axis: from earliest data/month in range through current month.
  let startMonth = monthKey(rangeStart);
  if (rangeAll && (sessionRows ?? []).length > 0) {
    startMonth = monthKey((sessionRows as { date: string }[])[0].date);
  } else if (rangeAll && events.length > 0) {
    startMonth = monthKey(
      events.reduce((a, e) => (e.date < a ? e.date : a), events[0].date),
    );
  }
  const months = monthKeysInclusive(startMonth, monthKey(today));
  const series = buildMonthlyAttendance(events, names, months);

  const selected =
    resolveItem(item, movements, benchmarks) ??
    (benchmarks[0]
      ? resolveItem(`benchmark:${benchmarks[0].id}`, movements, benchmarks)
      : movements[0]
        ? resolveItem(`movement:${movements[0].id}`, movements, benchmarks)
        : null);

  let entries: LeaderboardEntry[] = [];
  if (selected) {
    const { data } = await supabase
      .from("personal_bests")
      .select("profile_id, value, value_text, achieved_on, profiles(name, photo_url)")
      .eq(selected.col, selected.id)
      .eq("visibility", "club")
      .order("value", {
        ascending: lowerIsBetter(selected.scoreType),
        nullsFirst: false,
      });
    entries = ((data ?? []) as unknown as PbJoinRow[]).map((r) => ({
      profile_id: r.profile_id,
      name: r.profiles?.name ?? "Member",
      photo_url: r.profiles?.photo_url ?? null,
      value: r.value,
      value_text: r.value_text,
      achieved_on: r.achieved_on,
    }));
  }

  return (
    <>
      <Header profile={me} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="heading text-3xl">Leaderboard</h1>

        <section className="mt-6 rounded-lg border border-charcoal-700 bg-charcoal-800 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="heading text-lg text-gold">Sessions / month</h2>
              <p className="mt-0.5 text-xs text-neutral-500">
                Distinct sessions with a result or signup, per member.
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={`/leaderboard?range=12m${item ? `&item=${encodeURIComponent(item)}` : ""}`}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  !rangeAll
                    ? "bg-gold/15 text-gold"
                    : "border border-charcoal-700 text-neutral-400 hover:text-white"
                }`}
              >
                Rolling 12 months
              </a>
              <a
                href={`/leaderboard?range=all${item ? `&item=${encodeURIComponent(item)}` : ""}`}
                className={`rounded-md px-3 py-1.5 text-xs ${
                  rangeAll
                    ? "bg-gold/15 text-gold"
                    : "border border-charcoal-700 text-neutral-400 hover:text-white"
                }`}
              >
                All history
              </a>
            </div>
          </div>
          <AttendanceTimeline months={months} series={series} />
        </section>

        <form method="get" className="mt-8 flex items-end gap-2">
          {rangeAll && <input type="hidden" name="range" value="all" />}
          <label className="block text-xs text-neutral-400">
            Movement / benchmark
            <select
              name="item"
              defaultValue={selected?.key ?? ""}
              className="mt-1 block rounded-md border border-charcoal-700 bg-charcoal px-2 py-1.5 text-sm"
            >
              <optgroup label="Benchmarks">
                {benchmarks.map((b) => (
                  <option key={`b${b.id}`} value={`benchmark:${b.id}`}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Lifts">
                {movements.map((m) => (
                  <option key={`m${m.id}`} value={`movement:${m.id}`}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-gold hover:text-gold">
            Show
          </button>
        </form>

        <section className="mt-6">
          <h2 className="heading text-lg text-gold">{selected?.name ?? "—"}</h2>
          {entries.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              No club-shared results yet. Share a PB from your profile to appear
              here.
            </p>
          ) : (
            <ol className="mt-3 space-y-2">
              {entries.map((e, i) => (
                <li
                  key={e.profile_id}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
                    i === 0
                      ? "border-gold/40 bg-charcoal-800"
                      : "border-charcoal-700 bg-charcoal-800/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm">{medal(i)}</span>
                    <Avatar name={e.name} photo={e.photo_url} />
                    <span className="text-sm font-medium">{e.name}</span>
                  </div>
                  <span className="font-mono text-sm text-neutral-100">
                    {e.value_text ?? "—"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </>
  );
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photo}
        alt=""
        className="h-7 w-7 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-charcoal-700 text-xs font-medium text-neutral-300">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
