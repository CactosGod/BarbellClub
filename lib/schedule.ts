import type { Session, SessionWithMeta } from "@/lib/types";

// All schedule dates/times are reasoned about in the club's local timezone so
// "today", week boundaries and WOD reveal don't drift on a UTC server.
export const CLUB_TZ = "Europe/Helsinki";

// Weekday labels in the schema's order (0 = Monday … 6 = Sunday).
export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

// Sunday is the club's primary cadence — the default for new templates.
export const DEFAULT_WEEKDAY = 6;
export const DEFAULT_START_TIME = "10:00";

// Today's calendar date in the club timezone, as "YYYY-MM-DD" (en-CA => ISO order).
export function clubToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Parse "YYYY-MM-DD" to a Date anchored at UTC midnight. Used only for calendar-day
// arithmetic (add/subtract whole days), which is DST-safe on a Z-anchored date.
function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Schema weekday (0=Mon … 6=Sun) of a calendar date.
export function schemaWeekday(ymd: string): number {
  return (parseYmd(ymd).getUTCDay() + 6) % 7;
}

// Monday of the week containing `ymd`.
function mondayOf(ymd: string): Date {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() - schemaWeekday(ymd));
  return d;
}

// Week offset (0 = this week, -1 = last week, …) of the week containing `ymd`.
// Lets a session link back to the week view it belongs to.
export function weekOffsetFor(ymd: string, now: Date = new Date()): number {
  const current = mondayOf(clubToday(now));
  const target = mondayOf(ymd);
  const days = Math.round(
    (target.getTime() - current.getTime()) / 86_400_000,
  );
  return Math.round(days / 7);
}

// The 7 dates (Monday…Sunday) for the week `offset` weeks from the current club
// week. offset 0 = this week, -1 = last week, +1 = next week.
export function weekDates(offset: number, now: Date = new Date()): string[] {
  const monday = mondayOf(clubToday(now));
  monday.setUTCDate(monday.getUTCDate() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return toYmd(d);
  });
}

// "Sun 27 Jul" — a compact day heading. Formatted in UTC because the ymd is a bare
// calendar date with no time-of-day.
export function formatDayLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parseYmd(ymd));
}

// "10:00" from a "HH:MM:SS" time (or "" when null).
export function formatTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

// Is the WOD still hidden right now? (reveal_at in the future.)
export function isWodHidden(
  reveal_at: string | null,
  now: Date = new Date(),
): boolean {
  return !!reveal_at && new Date(reveal_at).getTime() > now.getTime();
}

// The club timezone's UTC offset (ms) at a given instant — accounts for DST.
function tzOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUtc = Date.UTC(
    +m.year,
    +m.month - 1,
    +m.day,
    +m.hour === 24 ? 0 : +m.hour,
    +m.minute,
    +m.second,
  );
  return asUtc - date.getTime();
}

// Interpret a "YYYY-MM-DDTHH:MM" wall-clock string (from <input datetime-local>)
// as club-local time and return the corresponding UTC ISO instant for storage.
export function clubLocalToIso(local: string): string {
  const naive = new Date(`${local}:00Z`).getTime(); // wall clock read as if UTC
  const offset = tzOffsetMs(new Date(naive));
  return new Date(naive - offset).toISOString();
}

// Inverse: a stored UTC ISO instant → "YYYY-MM-DDTHH:MM" club wall-clock, to
// prefill <input datetime-local> when editing.
export function isoToClubLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`;
}

// "Sun 27 Jul, 10:00" — when a hidden WOD becomes visible, in club time.
export function formatReveal(reveal_at: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(reveal_at));
}

// Decorate a raw session for one viewer: attach signup count / signed-up / full,
// and REDACT wod_description when it's hidden and the viewer isn't staff — so a
// pre-reveal WOD never leaves the server for a member's browser.
export function decorateSession(
  s: Session,
  opts: {
    signupCount: number;
    isSignedUp: boolean;
    isStaff: boolean;
    now?: Date;
  },
): SessionWithMeta {
  const now = opts.now ?? new Date();
  const hidden = isWodHidden(s.reveal_at, now) && !opts.isStaff;
  return {
    ...s,
    wod_description: hidden ? null : s.wod_description,
    signup_count: opts.signupCount,
    is_signed_up: opts.isSignedUp,
    is_full: s.capacity != null && opts.signupCount >= s.capacity,
    wod_hidden: hidden,
  };
}
