import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import EditableName from "@/components/EditableName";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type {
  Benchmark,
  Movement,
  PersonalBest,
  Profile,
  ScoreType,
} from "@/lib/types";
import { setPb, togglePbVisibility, deletePb } from "./actions";

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
              {profile.joined_at && <Badge>joined {profile.joined_at}</Badge>}
            </div>
          </div>
        </div>

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

        <section className="mt-10 rounded-lg border border-dashed border-charcoal-700 p-4">
          <p className="text-sm text-neutral-500">
            Result history and progress charts arrive in a later update.{" "}
            <Link href="/leaderboard" className="text-gold hover:underline">
              See the club leaderboard →
            </Link>
          </p>
        </section>
      </main>
    </>
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
