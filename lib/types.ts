// Hand-maintained mirror of supabase/schema.sql. Keep in sync when the schema changes.

export type UserRole = "member" | "coach" | "admin";
export type UserStatus = "pending" | "active" | "inactive";
export type ScoreType = "time" | "rounds_reps" | "load" | "text";
export type ResultSource = "self" | "whiteboard" | "import";
export type Visibility = "private" | "club";

export interface Profile {
  id: string;
  name: string;
  photo_url: string | null;
  role: UserRole;
  status: UserStatus;
  joined_at: string | null;
  created_at: string;
}

export const isStaff = (role: UserRole): boolean =>
  role === "coach" || role === "admin";

export interface Session {
  id: number;
  date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  title: string;
  wod_description: string | null;
  reveal_at: string | null; // ISO timestamp; null = visible immediately
  capacity: number | null; // null = unlimited
  coach_id: string | null;
  template_id: number | null;
  created_at: string;
}

export interface SessionTemplate {
  id: number;
  weekday: number; // 0 = Monday … 6 = Sunday
  start_time: string; // HH:MM:SS
  title: string;
  active: boolean;
}

export interface Signup {
  session_id: number;
  profile_id: string;
  created_at: string;
}

// A session decorated for a specific viewer: how many are signed up, whether the
// viewer is one of them, and whether the WOD is currently hidden. When hidden for
// a non-staff viewer, `wod_description` is redacted to null before leaving the server.
export interface SessionWithMeta extends Session {
  signup_count: number;
  is_signed_up: boolean;
  is_full: boolean;
  wod_hidden: boolean;
}

// A signed-up member, for attendee lists.
export interface Attendee {
  profile_id: string;
  name: string;
  photo_url: string | null;
}
