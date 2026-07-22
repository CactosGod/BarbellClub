"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Update the signed-in member's own display name. RLS restricts writes to the owner
// (and blocks role/status changes), so this is safe to call from the client form.
export async function updateName(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== id) return;

  await supabase.from("profiles").update({ name }).eq("id", id);
  revalidatePath(`/profile/${id}`);
}
