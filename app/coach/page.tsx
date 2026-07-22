import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaff, type Profile } from "@/lib/types";
import { setStatus, setRole } from "./actions";

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

// Coach-facing member management: approve pending sign-ins, toggle active/inactive,
// (admins) change roles. Later phases add sessions CRUD and whiteboard review here.
export default async function CoachPage() {
  const me = await getCurrentProfile();
  if (!me) redirect("/login");
  if (me.status !== "active") redirect("/pending");
  if (!isStaff(me.role)) redirect("/");

  // Service role: staff need to see every profile regardless of status/RLS.
  const { data } = await createAdminClient()
    .from("profiles")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });

  const profiles = (data ?? []) as Profile[];
  const pending = profiles.filter((p) => p.status === "pending");
  const others = profiles.filter((p) => p.status !== "pending");
  const isAdmin = me.role === "admin";

  return (
    <>
      <Header profile={me} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="heading text-3xl">Coach tools</h1>

        <section className="mt-8">
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
