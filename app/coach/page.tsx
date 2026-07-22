import { redirect } from "next/navigation";
import Header from "@/components/Header";
import SessionForm from "@/components/SessionForm";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isStaff,
  type Benchmark,
  type Movement,
  type Profile,
  type Session,
  type SessionTemplate,
} from "@/lib/types";
import {
  clubToday,
  DEFAULT_START_TIME,
  DEFAULT_WEEKDAY,
  formatDayLabel,
  formatTime,
  WEEKDAYS,
} from "@/lib/schedule";
import {
  createSession,
  createTemplate,
  deleteSession,
  deleteTemplate,
  generateSessions,
  setRole,
  setStatus,
  toggleTemplate,
  updateSession,
} from "./actions";

function StatusPill({ status }: { status: Profile["status"] }) {
  const tone =
    status === "active"
      ? "bg-green-500/15 text-green-400"
      : status === "pending"
        ? "bg-gold/15 text-gold"
        : "bg-neutral-500/15 text-neutral-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{status}</span>
  );
}

// Coach-facing management: schedule (sessions + recurring templates) and members.
export default async function CoachPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/pending");
  if (!isStaff(me.role)) redirect("/");

  const admin = createAdminClient();
  const today = clubToday();

  // Service role: staff manage the full picture regardless of RLS.
  const [
    { data: profileRows },
    { data: sessionRows },
    { data: templateRows },
    { data: movementRows },
    { data: benchmarkRows },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("*")
      .order("status", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("sessions")
      .select("*")
      .gte("date", today)
      .order("date")
      .order("start_time"),
    admin
      .from("session_templates")
      .select("*")
      .order("weekday")
      .order("start_time"),
    admin.from("movements").select("*").order("name"),
    admin.from("benchmarks").select("*").order("name"),
  ]);

  const profiles = (profileRows ?? []) as Profile[];
  const sessions = (sessionRows ?? []) as Session[];
  const templates = (templateRows ?? []) as SessionTemplate[];
  const movements = (movementRows ?? []) as Movement[];
  const benchmarks = (benchmarkRows ?? []) as Benchmark[];
  const pending = profiles.filter((p) => p.status === "pending");
  const others = profiles.filter((p) => p.status !== "pending");
  const isAdmin = me.role === "admin";

  return (
    <>
      <Header profile={me} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="heading text-3xl">Coach tools</h1>

        {/* Sessions ---------------------------------------------------------- */}
        <section className="mt-8">
          <h2 className="heading text-lg text-gold">
            Upcoming sessions ({sessions.length})
          </h2>

          <ul className="mt-3 space-y-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-charcoal-700 bg-charcoal-800 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {formatDayLabel(s.date)}
                      {s.start_time && ` · ${formatTime(s.start_time)}`} —{" "}
                      {s.title}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {s.capacity != null ? `cap ${s.capacity}` : "no cap"}
                      {s.reveal_at ? " · WOD hidden until reveal" : ""}
                    </p>
                  </div>
                  <form action={deleteSession}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="rounded-md border border-charcoal-700 px-2 py-1 text-xs text-neutral-400 hover:border-red hover:text-red">
                      Delete
                    </button>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-neutral-400 hover:text-white">
                    Edit
                  </summary>
                  <div className="mt-3">
                    <SessionForm
                      action={updateSession}
                      session={s}
                      submitLabel="Save changes"
                      movements={movements}
                      benchmarks={benchmarks}
                    />
                  </div>
                </details>
              </li>
            ))}
            {sessions.length === 0 && (
              <p className="text-sm text-neutral-500">
                No upcoming sessions — add one or generate from a template.
              </p>
            )}
          </ul>

          <details className="mt-4 rounded-lg border border-charcoal-700 bg-charcoal-800 p-3">
            <summary className="cursor-pointer text-sm font-medium text-neutral-200">
              + New session
            </summary>
            <div className="mt-3">
              <SessionForm
                action={createSession}
                submitLabel="Create session"
                movements={movements}
                benchmarks={benchmarks}
              />
            </div>
          </details>
        </section>

        {/* Templates --------------------------------------------------------- */}
        <section className="mt-10">
          <h2 className="heading text-lg text-gold">Weekly templates</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Generate creates sessions for the next 6 weeks from active templates,
            skipping dates that already exist.
          </p>

          <ul className="mt-3 space-y-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-charcoal-700 bg-charcoal-800 p-3"
              >
                <div>
                  <p className="font-medium">
                    {WEEKDAYS[t.weekday]} · {formatTime(t.start_time)}
                  </p>
                  <p className="text-xs text-neutral-500">{t.title}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      t.active
                        ? "bg-green-500/15 text-green-400"
                        : "bg-neutral-500/15 text-neutral-400"
                    }`}
                  >
                    {t.active ? "active" : "off"}
                  </span>
                  <form action={toggleTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={t.active ? "false" : "true"}
                    />
                    <button className="rounded-md border border-charcoal-700 px-2 py-1 text-xs text-neutral-300 hover:border-gold hover:text-gold">
                      {t.active ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <form action={deleteTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="rounded-md border border-charcoal-700 px-2 py-1 text-xs text-neutral-400 hover:border-red hover:text-red">
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-neutral-500">No templates yet.</p>
            )}
          </ul>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <form
              action={createTemplate}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="block text-xs text-neutral-400">
                Day
                <select
                  name="weekday"
                  defaultValue={DEFAULT_WEEKDAY}
                  className="mt-1 block rounded-md border border-charcoal-700 bg-charcoal px-2 py-1.5 text-sm"
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-neutral-400">
                Time
                <input
                  type="time"
                  name="start_time"
                  defaultValue={DEFAULT_START_TIME}
                  className="mt-1 block rounded-md border border-charcoal-700 bg-charcoal px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs text-neutral-400">
                Title
                <input
                  name="title"
                  defaultValue="Barbell Club"
                  className="mt-1 block rounded-md border border-charcoal-700 bg-charcoal px-2 py-1.5 text-sm"
                />
              </label>
              <button className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-gold hover:text-gold">
                Add template
              </button>
            </form>

            <form action={generateSessions}>
              <button className="rounded-md bg-red px-4 py-2 text-sm font-medium text-white hover:bg-red/90">
                Generate 6 weeks
              </button>
            </form>
          </div>
        </section>

        {/* Members ----------------------------------------------------------- */}
        <section className="mt-12">
          <h2 className="heading text-lg text-gold">
            Pending approval ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              No one waiting — you&apos;re all caught up.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pending.map((p) => (
                <MemberRow key={p.id} p={p} isAdmin={isAdmin} />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="heading text-lg text-neutral-300">
            Members ({others.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {others.map((p) => (
              <MemberRow key={p.id} p={p} isAdmin={isAdmin} />
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}

function MemberRow({ p, isAdmin }: { p: Profile; isAdmin: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-charcoal-700 bg-charcoal-800 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <StatusPill status={p.status} />
            <span className="text-xs text-neutral-500">{p.role}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {p.status !== "active" && (
          <form action={setStatus}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="status" value="active" />
            <button className="rounded-md bg-red px-3 py-1.5 text-sm font-medium text-white hover:bg-red/90">
              {p.status === "pending" ? "Approve" : "Reactivate"}
            </button>
          </form>
        )}
        {p.status === "active" && (
          <form action={setStatus}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="status" value="inactive" />
            <button className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-red hover:text-red">
              Deactivate
            </button>
          </form>
        )}

        {isAdmin && (
          <form action={setRole} className="flex items-center gap-1">
            <input type="hidden" name="id" value={p.id} />
            <select
              name="role"
              defaultValue={p.role}
              className="rounded-md border border-charcoal-700 bg-charcoal px-2 py-1.5 text-sm"
            >
              <option value="member">member</option>
              <option value="coach">coach</option>
              <option value="admin">admin</option>
            </select>
            <button className="rounded-md border border-charcoal-700 px-2 py-1.5 text-sm text-neutral-300 hover:border-gold hover:text-gold">
              Set
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
