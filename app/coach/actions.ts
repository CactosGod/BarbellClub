"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaff, type UserRole, type UserStatus } from "@/lib/types";

const STATUSES: UserStatus[] = ["pending", "active", "inactive"];
const ROLES: UserRole[] = ["member", "coach", "admin"];

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
