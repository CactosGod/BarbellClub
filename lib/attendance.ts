// Attendance = distinct sessions where a member has a result OR a signup.
// Denominator for % = club sessions on/after the member's first appearance.

export type AttendanceEvent = {
  profile_id: string;
  session_id: number;
  date: string; // YYYY-MM-DD
};

export type SessionDate = {
  id: number;
  date: string;
};

export type MemberSeries = {
  profile_id: string;
  name: string;
  months: Record<string, number>; // YYYY-MM → count
};

export type AttendanceRate = {
  attended: number;
  eligible: number;
  percent: number | null; // null when eligible === 0
};

/** "YYYY-MM" from a calendar date. */
export function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

/** First day of the month that is `monthsBack` months before `todayYmd`'s month. */
export function rolling12Start(todayYmd: string): string {
  const [y, m] = todayYmd.split("-").map(Number);
  const total = y * 12 + (m - 1) - 11;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

/** Inclusive list of YYYY-MM from startMonth through endMonth (both "YYYY-MM"). */
export function monthKeysInclusive(startMonth: string, endMonth: string): string[] {
  const out: string[] = [];
  let [y, m] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Earliest of joined_at / first event date, or null if nothing known. */
export function firstAppearance(
  joinedAt: string | null,
  events: AttendanceEvent[],
): string | null {
  let earliest: string | null = joinedAt;
  for (const e of events) {
    if (!earliest || e.date < earliest) earliest = e.date;
  }
  return earliest;
}

/** Earliest attended session date (result∪signup), ignoring joined_at. */
export function firstWorkoutDate(events: AttendanceEvent[]): string | null {
  if (events.length === 0) return null;
  let earliest = events[0].date;
  for (const e of events) {
    if (e.date < earliest) earliest = e.date;
  }
  return earliest;
}

/**
 * Deduped attendance events: one entry per (profile_id, session_id).
 * Prefer the date from the event; caller should only pass rows with dates.
 */
export function unionAttendance(
  fromResults: AttendanceEvent[],
  fromSignups: AttendanceEvent[],
): AttendanceEvent[] {
  const seen = new Map<string, AttendanceEvent>();
  for (const e of [...fromResults, ...fromSignups]) {
    if (!e.profile_id || !e.date) continue;
    const key = `${e.profile_id}:${e.session_id}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()];
}

/** Per-member monthly session counts for charting. */
export function buildMonthlyAttendance(
  events: AttendanceEvent[],
  names: Map<string, string>,
  months: string[],
): MemberSeries[] {
  const monthSet = new Set(months);
  const byMember = new Map<string, Map<string, Set<number>>>();

  for (const e of events) {
    const mk = monthKey(e.date);
    if (!monthSet.has(mk)) continue;
    let monthsMap = byMember.get(e.profile_id);
    if (!monthsMap) {
      monthsMap = new Map();
      byMember.set(e.profile_id, monthsMap);
    }
    let sessions = monthsMap.get(mk);
    if (!sessions) {
      sessions = new Set();
      monthsMap.set(mk, sessions);
    }
    sessions.add(e.session_id);
  }

  const series: MemberSeries[] = [];
  for (const [profileId, monthsMap] of byMember) {
    const record: Record<string, number> = {};
    let total = 0;
    for (const mk of months) {
      const n = monthsMap.get(mk)?.size ?? 0;
      record[mk] = n;
      total += n;
    }
    if (total === 0) continue;
    series.push({
      profile_id: profileId,
      name: names.get(profileId) ?? "Member",
      months: record,
    });
  }

  series.sort((a, b) => a.name.localeCompare(b.name));
  return series;
}

/**
 * Attendance rate for a member in [windowStart, windowEnd] (inclusive dates),
 * only counting sessions on/after firstAppearance.
 */
export function attendancePercent(
  events: AttendanceEvent[],
  sessions: SessionDate[],
  firstAppearanceYmd: string | null,
  windowStart: string,
  windowEnd: string,
): AttendanceRate {
  const start = firstAppearanceYmd
    ? firstAppearanceYmd > windowStart
      ? firstAppearanceYmd
      : windowStart
    : windowStart;

  const eligibleIds = new Set<number>();
  for (const s of sessions) {
    if (s.date >= start && s.date <= windowEnd) eligibleIds.add(s.id);
  }

  const attendedIds = new Set<number>();
  for (const e of events) {
    if (eligibleIds.has(e.session_id)) attendedIds.add(e.session_id);
  }

  const eligible = eligibleIds.size;
  const attended = attendedIds.size;
  return {
    attended,
    eligible,
    percent: eligible === 0 ? null : Math.round((100 * attended) / eligible),
  };
}
