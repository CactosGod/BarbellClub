import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import SignupButton from "@/components/SignupButton";
import ResultForm from "@/components/ResultForm";
import WhiteboardUpload from "@/components/WhiteboardUpload";
import WhiteboardReview from "@/components/WhiteboardReview";
import { deleteSession } from "@/app/coach/actions";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isStaff,
  type Attendee,
  type Result,
  type ResultWithMember,
  type Session,
  type WhiteboardUpload as WhiteboardUploadRow,
} from "@/lib/types";
import {
  clubToday,
  decorateSession,
  formatDayLabel,
  formatReveal,
  formatTime,
  weekOffsetFor,
} from "@/lib/schedule";

type MemberJoin = { name: string; photo_url: string | null } | null;
type SignupRow = { profile_id: string; profiles: MemberJoin };
type ResultRow = Result & { profiles: MemberJoin };

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/pending");

  const { id } = await params;
  const { back } = await searchParams;
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
    name: r.profiles?.name ?? r.board_name ?? "Member",
    photo_url: r.profiles?.photo_url ?? null,
    claimed: r.profile_id != null,
  }));
  const myResult = results.find((r) => r.profile_id === me.id) ?? null;

  const s = decorateSession(session, {
    signupCount: attendees.length,
    isSignedUp: attendees.some((a) => a.profile_id === me.id),
    isStaff: isStaff(me.role),
  });

  // Results are logged after training — offer the form only on today/past sessions.
  const today = clubToday();
  const canLog = s.date <= today;
  const past = s.date < today;
  const scoreMissing = past && s.is_signed_up && !myResult;

  // Return to where the user came from; only accept in-app relative paths. Fall
  // back to the week the session sits in so a direct link doesn't dump them at today.
  const safeBack = back && back.startsWith("/") && !back.startsWith("//");
  const weekOffset = weekOffsetFor(s.date);
  const backHref = safeBack
    ? back
    : weekOffset === 0
      ? "/"
      : `/?week=${weekOffset}`;

  // Adjacent workouts by (date, start_time, id). Keep `back` so Schedule returns
  // to the same place after hopping sessions.
  type Neighbor = {
    id: number;
    date: string;
    start_time: string | null;
    title: string;
  };
  const startTime = s.start_time ?? "00:00:00";
  const [{ data: prevSameDay }, { data: prevEarlier }, { data: nextSameDay }, { data: nextLater }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id, date, start_time, title")
        .eq("date", s.date)
        .lt("start_time", startTime)
        .order("start_time", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sessions")
        .select("id, date, start_time, title")
        .lt("date", s.date)
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sessions")
        .select("id, date, start_time, title")
        .eq("date", s.date)
        .gt("start_time", startTime)
        .order("start_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sessions")
        .select("id, date, start_time, title")
        .gt("date", s.date)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
  const prevSession = (prevSameDay ?? prevEarlier) as Neighbor | null;
  const nextSession = (nextSameDay ?? nextLater) as Neighbor | null;
  const navQs = safeBack ? `?back=${encodeURIComponent(back!)}` : "";

  // Staff-only whiteboard capture: show the pending review if one exists, else the
  // upload control. Uses the service-role client (staff-gated above).
  let whiteboardNode: ReactNode = null;
  if (isStaff(me.role)) {
    const admin = createAdminClient();
    const { data: pendingRow } = await admin
      .from("whiteboard_uploads")
      .select("*")
      .eq("session_id", sessionId)
      .eq("review_status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const pending = pendingRow as WhiteboardUploadRow | null;

    if (pending?.raw_parse) {
      const [{ data: signed }, { data: rosterRows }] = await Promise.all([
        admin.storage.from("whiteboards").createSignedUrl(pending.photo_path, 3600),
        admin.from("profiles").select("id, name").eq("status", "active").order("name"),
      ]);
      whiteboardNode = (
        <WhiteboardReview
          sessionId={s.id}
          uploadId={pending.id}
          photoUrl={signed?.signedUrl ?? null}
          parse={pending.raw_parse}
          roster={(rosterRows ?? []) as { id: string; name: string }[]}
        />
      );
    } else {
      whiteboardNode = <WhiteboardUpload sessionId={s.id} />;
    }
  }

  return (
    <>
      <Header profile={me} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link
          href={backHref}
          className="text-sm text-neutral-400 hover:text-white"
        >
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
            past={past}
          />
        </div>

        {scoreMissing && (
          <p className="mt-3 text-sm text-orange">
            Score missing, please add.
          </p>
        )}

        <nav className="mt-4 flex items-stretch justify-between gap-3 text-sm">
          {prevSession ? (
            <Link
              href={`/session/${prevSession.id}${navQs}`}
              className="min-w-0 flex-1 rounded-md border border-charcoal-700 bg-charcoal-800 px-3 py-2 text-neutral-300 hover:border-gold hover:text-gold"
            >
              <span className="block text-xs text-neutral-500">Previous</span>
              <span className="block truncate">
                ← {formatDayLabel(prevSession.date)}
                {prevSession.start_time
                  ? ` · ${formatTime(prevSession.start_time)}`
                  : ""}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {nextSession ? (
            <Link
              href={`/session/${nextSession.id}${navQs}`}
              className="min-w-0 flex-1 rounded-md border border-charcoal-700 bg-charcoal-800 px-3 py-2 text-right text-neutral-300 hover:border-gold hover:text-gold"
            >
              <span className="block text-xs text-neutral-500">Next</span>
              <span className="block truncate">
                {formatDayLabel(nextSession.date)}
                {nextSession.start_time
                  ? ` · ${formatTime(nextSession.start_time)}`
                  : ""}{" "}
                →
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>

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

        {whiteboardNode && (
          <section className="mt-8">
            <h2 className="heading text-lg text-gold">Whiteboard</h2>
            <div className="mt-3">{whiteboardNode}</div>
          </section>
        )}

        {me.role === "admin" && (
          <section className="mt-10">
            <details className="rounded-lg border border-charcoal-700 p-3">
              <summary className="cursor-pointer text-sm text-neutral-500 hover:text-red">
                Delete this session (admin)
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-neutral-500">
                  Permanently deletes the session and its signups, results and
                  whiteboard uploads. Use for phantom/duplicate sessions.
                </p>
                <form action={deleteSession}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="from" value="session" />
                  <button className="rounded-md bg-red px-3 py-1.5 text-sm font-medium text-white hover:bg-red/90">
                    Delete session
                  </button>
                </form>
              </div>
            </details>
          </section>
        )}
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
          <p
            className={`text-sm font-medium ${
              r.claimed ? "" : "italic text-neutral-400"
            }`}
          >
            {r.name}
          </p>
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
