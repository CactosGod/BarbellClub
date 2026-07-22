"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePbValue, type PbKind } from "@/lib/pb";
import { clubToday } from "@/lib/schedule";
import type { ScoreType, Visibility } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// ---------------------------------------------------------------------------
// Personal bests — all owner-scoped through the RLS-bound user client
// (`pb_owner_all`), so a member can only write their own rows.
// ---------------------------------------------------------------------------

const colFor = (kind: PbKind) =>
  kind === "movement" ? "movement_id" : "benchmark_id";

function parseKind(formData: FormData): PbKind | null {
  const k = String(formData.get("kind") ?? "");
  return k === "movement" || k === "benchmark" ? k : null;
}

// Upsert a PB for one item. Omits `visibility` so it keeps the existing setting
// (and defaults to 'private' on first insert). `value_text` is required by the
// schema, so callers pass a display string.
async function upsertPb(
  supabase: SupabaseClient,
  userId: string,
  kind: PbKind,
  itemId: number,
  value: number | null,
  valueText: string,
) {
  const col = colFor(kind);
  await supabase.from("personal_bests").upsert(
    {
      profile_id: userId,
      [col]: itemId,
      value,
      value_text: valueText,
      achieved_on: clubToday(),
    },
    { onConflict: `profile_id,${col}` },
  );
  revalidatePath(`/profile/${userId}`);
  revalidatePath("/leaderboard");
}

export type SavePbState = { saved: boolean };

// Confirm a PB surfaced by the "New PB?" prompt after logging a result. The value
// is already parsed by logResult, so we pass it straight through.
export async function savePb(
  _prev: SavePbState,
  formData: FormData,
): Promise<SavePbState> {
  const kind = parseKind(formData);
  const itemId = Number(formData.get("item_id"));
  const valueText = String(formData.get("value_text") ?? "");
  const valueRaw = formData.get("value");
  const value = valueRaw != null && valueRaw !== "" ? Number(valueRaw) : null;
  if (!kind || !Number.isInteger(itemId) || !valueText) return { saved: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { saved: false };

  await upsertPb(supabase, user.id, kind, itemId, value, valueText);
  return { saved: true };
}

// Set/update a PB from free-text input on the profile page.
export async function setPb(formData: FormData) {
  const kind = parseKind(formData);
  const itemId = Number(formData.get("item_id"));
  const scoreType = String(formData.get("score_type") ?? "") as ScoreType;
  const raw = String(formData.get("value") ?? "");
  if (!kind || !Number.isInteger(itemId)) return;

  const parsed = parsePbValue(scoreType, raw);
  if (!parsed) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await upsertPb(supabase, user.id, kind, itemId, parsed.value, parsed.value_text);
}

export async function togglePbVisibility(formData: FormData) {
  const kind = parseKind(formData);
  const itemId = Number(formData.get("item_id"));
  const visibility = String(formData.get("visibility") ?? "") as Visibility;
  if (!kind || !Number.isInteger(itemId)) return;
  if (visibility !== "club" && visibility !== "private") return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("personal_bests")
    .update({ visibility })
    .eq("profile_id", user.id)
    .eq(colFor(kind), itemId);
  revalidatePath(`/profile/${user.id}`);
  revalidatePath("/leaderboard");
}

export async function deletePb(formData: FormData) {
  const kind = parseKind(formData);
  const itemId = Number(formData.get("item_id"));
  if (!kind || !Number.isInteger(itemId)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("personal_bests")
    .delete()
    .eq("profile_id", user.id)
    .eq(colFor(kind), itemId);
  revalidatePath(`/profile/${user.id}`);
  revalidatePath("/leaderboard");
}

// ---------------------------------------------------------------------------
// Historical results — claim unclaimed rows to yourself, or release a mistaken
// one. Both go through the service-role client (import rows aren't member-
// writable under RLS) but are strictly pinned to the signed-in user.
// ---------------------------------------------------------------------------

// Claim every unclaimed result under a board name, skipping sessions where you
// already have a result (so a self-log or existing claim is never overwritten).
export async function claimBoardName(formData: FormData) {
  const name = String(formData.get("board_name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  const [{ data: candidates }, { data: mine }] = await Promise.all([
    admin.from("results").select("id, session_id").is("profile_id", null).eq("board_name", name),
    admin.from("results").select("session_id").eq("profile_id", user.id),
  ]);
  const taken = new Set((mine ?? []).map((r) => r.session_id));
  const ids = (candidates ?? [])
    .filter((c) => !taken.has(c.session_id))
    .map((c) => c.id);
  if (ids.length) {
    await admin.from("results").update({ profile_id: user.id }).in("id", ids);
  }
  revalidatePath(`/profile/${user.id}`);
  revalidatePath("/leaderboard");
}

// Release a claimed historical result back to unclaimed ("not me"). Only applies
// to import rows the caller owns (they keep board_name, so they stay valid).
export async function releaseResult(formData: FormData) {
  const id = Number(formData.get("result_id"));
  if (!Number.isInteger(id)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();
  const { data: r } = await admin
    .from("results")
    .select("id, profile_id, board_name, source")
    .eq("id", id)
    .maybeSingle();
  const row = r as {
    profile_id: string | null;
    board_name: string | null;
    source: string;
  } | null;
  if (!row || row.profile_id !== user.id || !row.board_name || row.source === "self") {
    return;
  }
  await admin.from("results").update({ profile_id: null }).eq("id", id);
  revalidatePath(`/profile/${user.id}`);
  revalidatePath("/leaderboard");
}
