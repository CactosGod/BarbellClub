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
