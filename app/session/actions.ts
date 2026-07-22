"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { error: string | null };

// Member joins or leaves a session. Writes go through the RLS-bound user client:
// `signups_own_write` restricts rows to the caller, and the capacity trigger
// rejects a join when the session is full. Returns an error string for the UI.
export async function toggleSignup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const sessionId = Number(formData.get("session_id"));
  const intent = String(formData.get("intent") ?? "");
  if (!Number.isInteger(sessionId)) return { error: "Invalid session." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out." };

  if (intent === "leave") {
    await supabase
      .from("signups")
      .delete()
      .eq("session_id", sessionId)
      .eq("profile_id", user.id);
  } else {
    const { error } = await supabase
      .from("signups")
      .insert({ session_id: sessionId, profile_id: user.id });
    // 23505 = already signed up: idempotent, treat as success. P0001 = capacity
    // trigger fired. Anything else is an unexpected failure.
    if (error && error.code !== "23505") {
      return {
        error:
          error.code === "P0001"
            ? "This session is full."
            : "Couldn't sign up — please try again.",
      };
    }
  }

  revalidatePath("/");
  revalidatePath(`/session/${sessionId}`);
  return { error: null };
}
