import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decorateSession } from "@/lib/schedule";
import type { Session, SessionWithMeta } from "@/lib/types";

export const WORKOUTS_PAGE_SIZE = 20;

export type DayGroup = { date: string; sessions: SessionWithMeta[] };

export async function withMeta(
  supabase: SupabaseClient,
  sessions: Session[],
  meId: string,
  staff: boolean,
): Promise<SessionWithMeta[]> {
  const ids = sessions.map((s) => s.id);
  const counts = new Map<number, number>();
  const mine = new Set<number>();
  const myResults = new Set<number>();
  if (ids.length) {
    const [{ data: signupData }, { data: resultData }] = await Promise.all([
      supabase
        .from("signups")
        .select("session_id, profile_id")
        .in("session_id", ids),
      supabase
        .from("results")
        .select("session_id")
        .eq("profile_id", meId)
        .in("session_id", ids),
    ]);
    for (const s of signupData ?? []) {
      counts.set(s.session_id, (counts.get(s.session_id) ?? 0) + 1);
      if (s.profile_id === meId) mine.add(s.session_id);
    }
    for (const r of resultData ?? []) {
      myResults.add(r.session_id);
    }
  }
  return sessions.map((s) => ({
    ...decorateSession(s, {
      signupCount: counts.get(s.id) ?? 0,
      isSignedUp: mine.has(s.id),
      isStaff: staff,
    }),
    has_my_result: myResults.has(s.id),
  }));
}

export function groupByDate(sessions: SessionWithMeta[]): DayGroup[] {
  const byDate = new Map<string, SessionWithMeta[]>();
  for (const s of sessions) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  return [...byDate.entries()].map(([date, ss]) => ({ date, sessions: ss }));
}

/** Newest-first page of all workouts (for All workouts + infinite scroll). */
export async function fetchWorkoutsPage(
  page: number,
  meId: string,
  staff: boolean,
): Promise<{ groups: DayGroup[]; hasMore: boolean }> {
  const supabase = await createClient();
  const from = page * WORKOUTS_PAGE_SIZE;
  const { data: rows } = await supabase
    .from("sessions")
    .select("*")
    .order("date", { ascending: false })
    .order("start_time", { ascending: false })
    .range(from, from + WORKOUTS_PAGE_SIZE);
  const all = (rows ?? []) as Session[];
  const hasMore = all.length > WORKOUTS_PAGE_SIZE;
  const sessions = await withMeta(
    supabase,
    all.slice(0, WORKOUTS_PAGE_SIZE),
    meId,
    staff,
  );
  return { groups: groupByDate(sessions), hasMore };
}
