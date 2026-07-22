"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isStaff,
  type SessionTemplate,
  type UserRole,
  type UserStatus,
} from "@/lib/types";
import { clubLocalToIso, clubToday, weekDates } from "@/lib/schedule";

const STATUSES: UserStatus[] = ["pending", "active", "inactive"];
const ROLES: UserRole[] = ["member", "coach", "admin"];

// How many weeks ahead "Generate sessions" materializes from active templates.
const GENERATE_WEEKS = 6;

// Guard: only coaches/admins may run membership actions. Returns the acting
// staff profile, or null if the caller is unauthorized.
async function requireStaff() {
  const me = await getCurrentProfile();
  if (!me || !isStaff(me.role)) return null;
  return me;
}

export async function setStatus(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as UserStatus;
  if (!id || !STATUSES.includes(status)) return;

  await createAdminClient().from("profiles").update({ status }).eq("id", id);
  revalidatePath("/coach");
}

export async function setRole(formData: FormData) {
  const me = await requireStaff();
  // Only admins can change roles (guards against a coach minting admins).
  if (!me || me.role !== "admin") return;

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;
  if (!id || !ROLES.includes(role)) return;

  await createAdminClient().from("profiles").update({ role }).eq("id", id);
  revalidatePath("/coach");
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

// Shared field parsing for create/update. Empty optional fields collapse to null.
function parseSessionFields(formData: FormData) {
  const date = String(formData.get("date") ?? "").trim();
  const startTime = String(formData.get("start_time") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || "Barbell Club";
  const wod = String(formData.get("wod_description") ?? "").trim();
  const capacityRaw = String(formData.get("capacity") ?? "").trim();
  const revealRaw = String(formData.get("reveal_at") ?? "").trim();
  const capacity = capacityRaw ? Number(capacityRaw) : null;

  // Optional PB tag: "movement:<id>" | "benchmark:<id>" | "".
  const tag = String(formData.get("tag") ?? "");
  let movement_id: number | null = null;
  let benchmark_id: number | null = null;
  if (tag.startsWith("movement:")) movement_id = Number(tag.slice(9)) || null;
  else if (tag.startsWith("benchmark:")) benchmark_id = Number(tag.slice(10)) || null;

  return {
    date,
    start_time: startTime || null,
    title,
    wod_description: wod || null,
    capacity: capacity != null && Number.isFinite(capacity) ? capacity : null,
    // <input datetime-local> gives club wall-clock; store as a UTC instant.
    reveal_at: revealRaw ? clubLocalToIso(revealRaw) : null,
    movement_id,
    benchmark_id,
  };
}

export async function createSession(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const fields = parseSessionFields(formData);
  if (!fields.date) return;

  await createAdminClient()
    .from("sessions")
    .insert({ ...fields, coach_id: me.id });
  revalidatePath("/coach");
  revalidatePath("/");
}

export async function updateSession(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const fields = parseSessionFields(formData);
  if (!fields.date) return;

  await createAdminClient().from("sessions").update(fields).eq("id", id);
  revalidatePath("/coach");
  revalidatePath("/");
  revalidatePath(`/session/${id}`);
}

export async function deleteSession(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;

  await createAdminClient().from("sessions").delete().eq("id", id);
  revalidatePath("/coach");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Weekly templates
// ---------------------------------------------------------------------------

export async function createTemplate(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const weekday = Number(formData.get("weekday"));
  const startTime = String(formData.get("start_time") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || "Barbell Club";
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !startTime) {
    return;
  }

  await createAdminClient()
    .from("session_templates")
    .insert({ weekday, start_time: startTime, title });
  revalidatePath("/coach");
}

export async function toggleTemplate(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const id = Number(formData.get("id"));
  const active = String(formData.get("active") ?? "") === "true";
  if (!Number.isInteger(id)) return;

  await createAdminClient()
    .from("session_templates")
    .update({ active })
    .eq("id", id);
  revalidatePath("/coach");
}

export async function deleteTemplate(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;

  await createAdminClient().from("session_templates").delete().eq("id", id);
  revalidatePath("/coach");
}

// Materialize concrete sessions from every active template for the next
// GENERATE_WEEKS weeks. Skips dates already in the past and, via the
// (date, start_time) unique constraint, dates that already have a session.
export async function generateSessions() {
  const me = await requireStaff();
  if (!me) return;

  const admin = createAdminClient();
  const { data } = await admin
    .from("session_templates")
    .select("*")
    .eq("active", true);
  const templates = (data ?? []) as SessionTemplate[];

  const today = clubToday();
  const rows: Array<{
    date: string;
    start_time: string;
    title: string;
    template_id: number;
    coach_id: string;
  }> = [];

  for (const t of templates) {
    for (let w = 0; w < GENERATE_WEEKS; w++) {
      const date = weekDates(w)[t.weekday];
      if (date < today) continue;
      rows.push({
        date,
        start_time: t.start_time,
        title: t.title,
        template_id: t.id,
        coach_id: me.id,
      });
    }
  }

  if (rows.length) {
    await admin
      .from("sessions")
      .upsert(rows, { onConflict: "date,start_time", ignoreDuplicates: true });
  }
  revalidatePath("/coach");
  revalidatePath("/");
}
