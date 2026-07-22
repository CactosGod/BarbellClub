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
  movement_id: number | null; // optional PB tag: a named lift…
  benchmark_id: number | null; // …or a benchmark (at most one set)
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

export interface Result {
  id: number;
  session_id: number;
  profile_id: string | null; // null = unclaimed historical row (see board_name)
  board_name: string | null; // name as written on the whiteboard (import)
  score_type: ScoreType;
  value: number | null; // sortable; canonical display lives in value_text
  value_text: string;
  rx: boolean;
  source: ResultSource;
  verified: boolean;
  created_at: string;
}

// A result prepared for the session results feed. `name` resolves to the member's
// name, or the board name for unclaimed rows; `claimed` is false for the latter.
export interface ResultWithMember extends Result {
  name: string;
  photo_url: string | null;
  claimed: boolean;
}

export interface Movement {
  id: number;
  name: string;
  unit: string; // e.g. "kg"
}

export interface Benchmark {
  id: number;
  name: string;
  score_type: ScoreType;
  description: string | null;
}

export interface PersonalBest {
  id: number;
  profile_id: string;
  movement_id: number | null;
  benchmark_id: number | null;
  value: number | null;
  value_text: string | null;
  achieved_on: string | null;
  visibility: Visibility;
}

// A club-visible PB joined to its member, for leaderboards.
export interface LeaderboardEntry {
  profile_id: string;
  name: string;
  photo_url: string | null;
  value: number | null;
  value_text: string | null;
  achieved_on: string | null;
}

// Strict JSON shape returned by the Claude vision parse. All-string fields (empty
// = "none") keep the structured-output schema simple; the app normalizes on read.
export interface WhiteboardParseResult {
  name_on_board: string;
  matched_member: string; // roster name guess, or "" for none
  confidence: "high" | "low";
  score: string; // as written on the board
  rx: "rx" | "scaled" | "unknown";
}

export interface WhiteboardParse {
  is_whiteboard: boolean;
  workout_description: string; // "" = none legible
  results: WhiteboardParseResult[];
}

export type ReviewStatus = "pending" | "reviewed" | "discarded";

export interface WhiteboardUpload {
  id: number;
  session_id: number;
  photo_path: string;
  raw_parse: WhiteboardParse | null;
  review_status: ReviewStatus;
  uploaded_by: string | null;
  created_at: string;
}
