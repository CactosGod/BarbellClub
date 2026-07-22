import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConfigured } from "@/lib/env";
import type { Profile } from "@/lib/types";

// Derive a display name + photo from Google identity metadata.
function profileFromUser(user: User) {
  const meta = user.user_metadata ?? {};
  const name =
    meta.full_name || meta.name || user.email?.split("@")[0] || "New member";
  const photo_url = meta.avatar_url || meta.picture || null;
  return { name, photo_url };
}

// Ensures a profiles row exists for a freshly authenticated user. New sign-ins land
// as `pending` (per SPEC roles); a coach/admin approves them later. Idempotent.
export async function ensureProfile(user: User): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return;

  const { name, photo_url } = profileFromUser(user);
  await admin.from("profiles").insert({ id: user.id, name, photo_url });
}

// Current authenticated user's profile, or null if signed out / no row yet.
export async function getCurrentProfile(): Promise<Profile | null> {
  if (!isConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
}
