"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseScore, SCORE_TYPES } from "@/lib/results";
import type { ScoreType } from "@/lib/types";

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

export type ResultState = { error: string | null };

// Log (or update) the signed-in member's own result for a session. One result per
// (member, session): we upsert on that pair. A self-logged result OVERRIDES any
// whiteboard/import row for this member (SPEC dedup rule), so the write goes
// through the service-role client — RLS `results_own_write` checks the existing
// row's source and would block overwriting a non-self row. profile_id is pinned
// to the caller, so a member can still only write their own result.
export async function logResult(
  _prev: ResultState,
  formData: FormData,
): Promise<ResultState> {
  const sessionId = Number(formData.get("session_id"));
  const scoreType = String(formData.get("score_type") ?? "") as ScoreType;
  if (!Number.isInteger(sessionId)) return { error: "Invalid session." };
  if (!SCORE_TYPES.includes(scoreType)) return { error: "Pick a score type." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out." };

  const str = (k: string) => String(formData.get(k) ?? "");
  const parsed = parseScore(scoreType, {
    minutes: str("minutes"),
    seconds: str("seconds"),
    rounds: str("rounds"),
    reps: str("reps"),
    load: str("load"),
    text: str("text"),
  });
  if (!parsed) return { error: "Enter your score." };

  const rx = str("rx") === "true";

  const { error } = await createAdminClient()
    .from("results")
    .upsert(
      {
        session_id: sessionId,
        profile_id: user.id,
        score_type: scoreType,
        value: parsed.value,
        value_text: parsed.value_text,
        rx,
        source: "self",
        verified: true,
      },
      { onConflict: "session_id,profile_id" },
    );
  if (error) return { error: "Couldn't save — please try again." };

  revalidatePath(`/session/${sessionId}`);
  return { error: null };
}

// Remove the caller's own result for a session. Guarded to their own row.
export async function deleteResult(formData: FormData) {
  const sessionId = Number(formData.get("session_id"));
  if (!Number.isInteger(sessionId)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await createAdminClient()
    .from("results")
    .delete()
    .eq("session_id", sessionId)
    .eq("profile_id", user.id);
  revalidatePath(`/session/${sessionId}`);
}
