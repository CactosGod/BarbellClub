import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import EditableName from "@/components/EditableName";
import AttendanceGauges from "@/components/AttendanceGauges";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type {
  Benchmark,
  Movement,
  PersonalBest,
  Profile,
  Result,
  ScoreType,
} from "@/lib/types";
import { clubToday, formatDayLabel } from "@/lib/schedule";
import {
  attendancePercent,
  firstAppearance,
  firstWorkoutDate,
  rolling12Start,
  unionAttendance,
  type AttendanceEvent,
} from "@/lib/attendance";
import {
  setPb,
  togglePbVisibility,
  deletePb,
  claimBoardName,
  releaseResult,
} from "./actions";

type HistoryRow = Result & { sessions: { date: string; title: string } | null };

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-charcoal-700 bg-charcoal-800 px-3 py-1 text-xs uppercase tracking-wide text-neutral-300">
      {children}
    </span>
  );
}

function hintFor(scoreType: ScoreType): string {
  switch (scoreType) {
    case "load":
      return "e.g. 100";
    case "time":
      return "e.g. 4:32";
    case "rounds_reps":
      return "e.g. 5 + 12";
    default:
      return "score";
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getCurrentProfile();
  if (!viewer) redirect("/login");
  if (viewer.status !== "active") redirect("/pending");

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const profile = data as Profile | null;
  if (!profile) notFound();

  const isOwner = viewer.id === profile.id;

  // Catalogs + this profile's PBs. RLS returns all of the owner's PBs, but only
  // club-visible ones when viewing someone else.
  const [{ data: movementRows }, { data: benchmarkRows }, { data: pbRows }] =
    await Promise.all([
      supabase.from("movements").select("*").order("name"),
      supabase.from("benchmarks").select("*").order("name"),
      supabase.from("personal_bests").select("*").eq("profile_id", id),
    ]);
  const movements = (movementRows ?? []) as Movement[];
  const benchmarks = (benchmarkRows ?? []) as Benchmark[];
  const pbs = (pbRows ?? []) as PersonalBest[];

  const pbByMovement = new Map<number, PersonalBest>();
  const pbByBenchmark = new Map<number, PersonalBest>();
  for (const pb of pbs) {
    if (pb.movement_id != null) pbByMovement.set(pb.movement_id, pb);
    else if (pb.benchmark_id != null) pbByBenchmark.set(pb.benchmark_id, pb);
  }

  // Training history for this profile (newest first).
  const { data: resultRows } = await supabase
    .from("results")
    .select("*, sessions(date, title)")
    .eq("profile_id", id);
  const history = ((resultRows ?? []) as unknown as HistoryRow[]).sort((a, b) =>
    (b.sessions?.date ?? "").localeCompare(a.sessions?.date ?? ""),
  );

  // Attendance: result ∪ signup, member-relative denominators.
  const today = clubToday();
  const [
    { data: attResultRows },
    { data: attSignupRows },
    { data: allSessionRows },
  ] = await Promise.all([
    supabase
      .from("results")
      .select("profile_id, session_id, sessions!inner(date)")
      .eq("profile_id", id),
    supabase
      .from("signups")
      .select("profile_id, session_id, sessions!inner(date)")
      .eq("profile_id", id),
    supabase
      .from("sessions")
      .select("id, date")
      .lte("date", today)
      .order("date"),
  ]);

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
  const mapAtt = (rows: AttRow[] | null): AttendanceEvent[] =>
    (rows ?? [])
      .map((r) => {
        const date = sessionDate(r.sessions);
        if (!date) return null;
        return {
          profile_id: r.profile_id,
          session_id: r.session_id,
          date,
        };
      })
      .filter((x): x is AttendanceEvent => x != null);

  const attEvents = unionAttendance(
    mapAtt(attResultRows as AttRow[] | null),
    mapAtt(attSignupRows as AttRow[] | null),
  );
  const sessions = (allSessionRows ?? []) as { id: number; date: string }[];
  const appearance = firstAppearance(profile.joined_at, attEvents);
  const firstWorkout = firstWorkoutDate(attEvents);
  const lifetimeRate = attendancePercent(
    attEvents,
    sessions,
    appearance,
    appearance ?? "2000-01-01",
    today,
  );
  const last12Rate = attendancePercent(
    attEvents,
    sessions,
    appearance,
    rolling12Start(today),
    today,
  );

  // Own profile: unclaimed board names to claim, likely matches first.
  let likelyNames: { name: string; count: number }[] = [];
  let otherNames: { name: string; count: number }[] = [];
  if (isOwner) {
    const { data: unclaimed } = await supabase
      .from("results")
      .select("board_name")
      .is("profile_id", null);
    const counts = new Map<string, number>();
    for (const r of unclaimed ?? []) {
      const n = ((r as { board_name: string | null }).board_name ?? "").trim();
      if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const first = profile.name.split(" ")[0].toLowerCase();
    const isLikely = (ln: string) =>
      ln.includes(first) ||
      first.includes(ln) ||
      (ln.length >= 3 && ln.slice(0, 3) === first.slice(0, 3));
    const all = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    likelyNames = all.filter((n) => isLikely(n.name.toLowerCase()));
    otherNames = all.filter((n) => !isLikely(n.name.toLowerCase()));
  }

  return (
    <>
      <Header profile={viewer} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-5">
          {profile.photo_url ? (
            <Image
              src={profile.photo_url}
              alt={profile.name}
              width={80}
              height={80}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-charcoal-700 text-2xl">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            {isOwner ? (
              <EditableName id={profile.id} name={profile.name} />
            ) : (
              <h1 className="heading text-3xl">{profile.name}</h1>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{profile.role}</Badge>
              <Badge>{profile.status}</Badge>
              {profile.joined_at && (
                <Badge>first login {profile.joined_at}</Badge>
              )}
              {firstWorkout && (
                <Badge>first workout {firstWorkout}</Badge>
              )}
            </div>
          </div>
        </div>

        <AttendanceGauges last12={last12Rate} lifetime={lifetimeRate} />

        <PbSection
          title="Lifts"
          kind="movement"
          items={movements.map((m) => ({
            id: m.id,
            name: m.name,
            scoreType: "load" as ScoreType,
            pb: pbByMovement.get(m.id) ?? null,
          }))}
          isOwner={isOwner}
        />

        <PbSection
          title="Benchmarks"
          kind="benchmark"
          items={benchmarks.map((b) => ({
            id: b.id,
            name: b.name,
            scoreType: b.score_type,
            pb: pbByBenchmark.get(b.id) ?? null,
          }))}
          isOwner={isOwner}
        />

        {isOwner && (likelyNames.length > 0 || otherNames.length > 0) && (
          <section className="mt-10">
            <h2 className="heading text-lg text-gold">Claim past results</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Whiteboards from before you joined. Tap a name you trained under to
              add all its results to your history.
            </p>
            {likelyNames.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {likelyNames.map((n) => (
                  <ClaimButton key={n.name} name={n.name} count={n.count} likely />
                ))}
              </div>
            )}
            {otherNames.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-neutral-400 hover:text-white">
                  Show all names ({otherNames.length})
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {otherNames.map((n) => (
                    <ClaimButton key={n.name} name={n.name} count={n.count} />
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        <section className="mt-10">
          <h2 className="heading text-lg text-neutral-300">
            Training history ({history.length})
          </h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No results logged yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {history.map((r) => (
                <HistoryRowItem key={r.id} r={r} isOwner={isOwner} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function ClaimButton({
  name,
  count,
  likely = false,
}: {
  name: string;
  count: number;
  likely?: boolean;
}) {
  return (
    <form action={claimBoardName}>
      <input type="hidden" name="board_name" value={name} />
      <button
        className={`rounded-full border px-3 py-1 text-sm ${
          likely
            ? "border-gold/40 bg-gold/10 text-gold hover:bg-gold/20"
            : "border-charcoal-700 text-neutral-300 hover:border-gold hover:text-gold"
        }`}
      >
        {name} <span className="text-xs opacity-70">· {count}</span>
      </button>
    </form>
  );
}

function HistoryRowItem({ r, isOwner }: { r: HistoryRow; isOwner: boolean }) {
  const canRelease = isOwner && r.source !== "self" && r.board_name != null;
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-charcoal-700 bg-charcoal-800 p-3">
      <div className="min-w-0">
        <Link
          href={`/session/${r.session_id}`}
          className="text-sm font-medium hover:text-gold"
        >
          {r.sessions ? r.sessions.title : "Session"}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          {r.sessions && <span>{formatDayLabel(r.sessions.date)}</span>}
          <span className={r.rx ? "text-gold" : "text-neutral-400"}>
            {r.rx ? "Rx" : "Scaled"}
          </span>
          {r.source !== "self" && <span>· {r.source}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-neutral-100">{r.value_text}</span>
        {canRelease && (
          <form action={releaseResult}>
            <input type="hidden" name="result_id" value={r.id} />
            <button
              className="text-xs text-neutral-600 hover:text-red"
              title="Release this result — not me"
            >
              not me
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

type PbItem = {
  id: number;
  name: string;
  scoreType: ScoreType;
  pb: PersonalBest | null;
};

function PbSection({
  title,
  kind,
  items,
  isOwner,
}: {
  title: string;
  kind: "movement" | "benchmark";
  items: PbItem[];
  isOwner: boolean;
}) {
  // For other people's profiles, show only items they've shared to the club.
  const visible = isOwner ? items : items.filter((i) => i.pb);

  return (
    <section className="mt-8">
      <h2 className="heading text-lg text-gold">{title}</h2>
      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">Nothing shared yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((item) => (
            <PbRow key={item.id} kind={kind} item={item} isOwner={isOwner} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PbRow({
  kind,
  item,
  isOwner,
}: {
  kind: "movement" | "benchmark";
  item: PbItem;
  isOwner: boolean;
}) {
  const pb = item.pb;

  return (
    <li className="rounded-lg border border-charcoal-700 bg-charcoal-800 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{item.name}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-neutral-100">
            {pb?.value_text ?? "—"}
          </span>
          {pb && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                pb.visibility === "club"
                  ? "bg-gold/15 text-gold"
                  : "bg-neutral-500/15 text-neutral-400"
              }`}
            >
              {pb.visibility}
            </span>
          )}
        </div>
      </div>

      {isOwner && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form action={setPb} className="flex items-center gap-1">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="item_id" value={item.id} />
            <input type="hidden" name="score_type" value={item.scoreType} />
            <input
              name="value"
              defaultValue={pb?.value_text ?? ""}
              placeholder={hintFor(item.scoreType)}
              className="w-28 rounded-md border border-charcoal-700 bg-charcoal px-2 py-1 text-sm"
            />
            <button className="rounded-md border border-charcoal-700 px-2 py-1 text-sm text-neutral-200 hover:border-gold hover:text-gold">
              {pb ? "Update" : "Set"}
            </button>
          </form>

          {pb && (
            <>
              <form action={togglePbVisibility}>
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="item_id" value={item.id} />
                <input
                  type="hidden"
                  name="visibility"
                  value={pb.visibility === "club" ? "private" : "club"}
                />
                <button className="rounded-md border border-charcoal-700 px-2 py-1 text-xs text-neutral-300 hover:border-gold hover:text-gold">
                  {pb.visibility === "club" ? "Make private" : "Share to club"}
                </button>
              </form>
              <form action={deletePb}>
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="item_id" value={item.id} />
                <button className="rounded-md border border-charcoal-700 px-2 py-1 text-xs text-neutral-400 hover:border-red hover:text-red">
                  Delete
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </li>
  );
}
