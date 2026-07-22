"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseScore, SCORE_TYPES } from "@/lib/results";
import { isBetter, type PbKind } from "@/lib/pb";
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

// Surfaced when a logged result beats (or first-sets) the member's PB for a
// movement/benchmark the session is tagged with. The UI offers to save it.
export type PbPrompt = {
  kind: PbKind;
  itemId: number;
  name: string;
  value: number;
  valueText: string;
};

export type ResultState = { error: string | null; pb?: PbPrompt | null };

// If the session is tagged with a movement/benchmark and the just-logged result
// beats the member's stored PB for it, return a prompt describing the new PB.
async function detectPb(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: number,
  scoreType: ScoreType,
  value: number | null,
  valueText: string,
): Promise<PbPrompt | null> {
  if (value == null) return null;

  const { data: sess } = await supabase
    .from("sessions")
    .select("movement_id, benchmark_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return null;

  if (sess.benchmark_id) {
    const { data: bench } = await supabase
      .from("benchmarks")
      .select("id, name, score_type")
      .eq("id", sess.benchmark_id)
      .maybeSingle();
    // Only compare when the logged type matches the benchmark's scoring.
    if (!bench || bench.score_type !== scoreType) return null;
    const { data: cur } = await supabase
      .from("personal_bests")
      .select("value")
      .eq("profile_id", userId)
      .eq("benchmark_id", bench.id)
      .maybeSingle();
    if (!isBetter(scoreType, value, cur?.value ?? null)) return null;
    return { kind: "benchmark", itemId: bench.id, name: bench.name, value, valueText };
  }

  if (sess.movement_id && scoreType === "load") {
    const { data: mv } = await supabase
      .from("movements")
      .select("id, name")
      .eq("id", sess.movement_id)
      .maybeSingle();
    if (!mv) return null;
    const { data: cur } = await supabase
      .from("personal_bests")
      .select("value")
      .eq("profile_id", userId)
      .eq("movement_id", mv.id)
      .maybeSingle();
    if (!isBetter("load", value, cur?.value ?? null)) return null;
    return { kind: "movement", itemId: mv.id, name: mv.name, value, valueText };
  }

  return null;
}

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

  const pb = await detectPb(
    supabase,
    user.id,
    sessionId,
    scoreType,
    parsed.value,
    parsed.value_text,
  );

  revalidatePath(`/session/${sessionId}`);
  return { error: null, pb };
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
