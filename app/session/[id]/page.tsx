import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import SignupButton from "@/components/SignupButton";
import ResultForm from "@/components/ResultForm";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isStaff,
  type Attendee,
  type Result,
  type ResultWithMember,
  type Session,
} from "@/lib/types";
import {
  clubToday,
  decorateSession,
  formatDayLabel,
  formatReveal,
  formatTime,
} from "@/lib/schedule";

type MemberJoin = { name: string; photo_url: string | null } | null;
type SignupRow = { profile_id: string; profiles: MemberJoin };
type ResultRow = Result & { profiles: MemberJoin };

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/pending");

  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) notFound();

  const supabase = await createClient();
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sessionRow) notFound();
  const session = sessionRow as Session;

  const { data: signupRows } = await supabase
    .from("signups")
    .select("profile_id, profiles(name, photo_url)")
    .eq("session_id", sessionId)
    .order("created_at");
  const signups = (signupRows ?? []) as unknown as SignupRow[];

  const attendees: Attendee[] = signups.map((s) => ({
    profile_id: s.profile_id,
    name: s.profiles?.name ?? "Member",
    photo_url: s.profiles?.photo_url ?? null,
  }));

  const { data: resultRows } = await supabase
    .from("results")
    .select("*, profiles(name, photo_url)")
    .eq("session_id", sessionId)
    .order("value", { ascending: true, nullsFirst: false })
    .order("created_at");
  const results: ResultWithMember[] = (
    (resultRows ?? []) as unknown as ResultRow[]
  ).map((r) => ({
    ...r,
    name: r.profiles?.name ?? "Member",
    photo_url: r.profiles?.photo_url ?? null,
  }));
  const myResult = results.find((r) => r.profile_id === me.id) ?? null;

  const s = decorateSession(session, {
    signupCount: attendees.length,
    isSignedUp: attendees.some((a) => a.profile_id === me.id),
    isStaff: isStaff(me.role),
  });

  // Results are logged after training — offer the form only on today/past sessions.
  const canLog = s.date <= clubToday();

  return (
    <>
      <Header profile={me} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">
          ← Schedule
        </Link>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="heading text-3xl">{s.title}</h1>
            <p className="mt-1 text-neutral-400">
              {formatDayLabel(s.date)}
              {s.start_time && ` · ${formatTime(s.start_time)}`}
            </p>
          </div>
          <SignupButton
            sessionId={s.id}
            isSignedUp={s.is_signed_up}
            isFull={s.is_full}
          />
        </div>

        <section className="mt-6 rounded-lg border border-charcoal-700 bg-charcoal-800 p-4">
          <h2 className="heading text-lg text-gold">Workout</h2>
          {s.wod_hidden ? (
            <p className="mt-2 text-sm text-neutral-400">
              🔒 Hidden until {s.reveal_at && formatReveal(s.reveal_at)}.
            </p>
          ) : s.wod_description ? (
            <p className="mt-2 whitespace-pre-wrap text-neutral-200">
              {s.wod_description}
            </p>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">
              No workout posted yet.
            </p>
          )}
        </section>

        <section className="mt-6">
          <h2 className="heading text-lg text-neutral-300">
            Attendees ({attendees.length}
            {s.capacity != null ? `/${s.capacity}` : ""})
          </h2>
          {attendees.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              No one signed up yet — be the first.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {attendees.map((a) => (
                <li
                  key={a.profile_id}
                  className="flex items-center gap-2 rounded-full border border-charcoal-700 bg-charcoal-800 py-1 pl-1 pr-3"
                >
                  <Avatar name={a.name} photo={a.photo_url} />
                  <span className="text-sm">{a.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          {canLog ? (
            <ResultForm sessionId={s.id} existing={myResult} />
          ) : (
            <div className="rounded-lg border border-dashed border-charcoal-700 p-4">
              <p className="text-sm text-neutral-500">
                Log opens after the session.
              </p>
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="heading text-lg text-neutral-300">
            Results ({results.length})
          </h2>
          {results.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              No results logged yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {results.map((r) => (
                <ResultRow key={r.id} r={r} isMe={r.profile_id === me.id} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function ResultRow({ r, isMe }: { r: ResultWithMember; isMe: boolean }) {
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${
        isMe
          ? "border-gold/40 bg-charcoal-800"
          : "border-charcoal-700 bg-charcoal-800/50"
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={r.name} photo={r.photo_url} />
        <div>
          <p className="text-sm font-medium">{r.name}</p>
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            <span
              className={
                r.rx ? "font-medium text-gold" : "text-neutral-400"
              }
            >
              {r.rx ? "Rx" : "Scaled"}
            </span>
            {r.source !== "self" && (
              <span className="text-neutral-500">· {r.source}</span>
            )}
          </div>
        </div>
      </div>
      <span className="font-mono text-sm text-neutral-100">{r.value_text}</span>
    </li>
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
