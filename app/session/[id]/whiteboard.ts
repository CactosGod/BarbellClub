"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWhiteboardImage } from "@/lib/whiteboard";
import { isStaff, type Profile } from "@/lib/types";

const BUCKET = "whiteboards";
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

async function requireStaff(): Promise<Profile | null> {
  const me = await getCurrentProfile();
  if (!me || !isStaff(me.role)) return null;
  return me;
}

export type WhiteboardState = { error: string | null };

// Upload a whiteboard photo for a session, parse it with Claude vision, and store
// the result as a pending whiteboard_uploads row for coach review. Never commits
// results — that's a separate, explicit step.
export async function parseWhiteboard(
  _prev: WhiteboardState,
  formData: FormData,
): Promise<WhiteboardState> {
  const me = await requireStaff();
  if (!me) return { error: "Coaches only." };

  const sessionId = Number(formData.get("session_id"));
  const file = formData.get("photo");
  if (!Number.isInteger(sessionId)) return { error: "Invalid session." };
  if (!(file instanceof File) || file.size === 0)
    return { error: "Choose a photo first." };
  if (!MEDIA_TYPES.includes(file.type))
    return { error: "Use a JPEG, PNG, WebP or GIF image." };
  if (file.size > MAX_BYTES) return { error: "Image is too large (max 10 MB)." };

  const admin = createAdminClient();
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split("/")[1];
  const path = `${sessionId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type });
  if (uploadError) return { error: "Upload failed — please try again." };

  // Context for the parse: the session date, its signups, and the full roster.
  const [{ data: session }, { data: signupRows }, { data: rosterRows }] =
    await Promise.all([
      admin.from("sessions").select("date").eq("id", sessionId).maybeSingle(),
      admin
        .from("signups")
        .select("profiles(name)")
        .eq("session_id", sessionId),
      admin.from("profiles").select("name").eq("status", "active").order("name"),
    ]);

  const attendees = (
    (signupRows ?? []) as unknown as { profiles: { name: string } | null }[]
  )
    .map((r) => r.profiles?.name)
    .filter((n): n is string => Boolean(n));
  const roster = ((rosterRows ?? []) as { name: string }[]).map((r) => r.name);

  let parse;
  try {
    parse = await parseWhiteboardImage({
      base64: bytes.toString("base64"),
      mediaType: file.type as "image/jpeg",
      date: (session as { date: string } | null)?.date ?? "",
      roster,
      attendees,
    });
  } catch {
    // Keep the uploaded file but leave no pending row; coach can retry.
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Couldn't read the whiteboard — please try again." };
  }

  await admin.from("whiteboard_uploads").insert({
    session_id: sessionId,
    photo_path: path,
    raw_parse: parse,
    uploaded_by: me.id,
    review_status: "pending",
  });

  revalidatePath(`/session/${sessionId}`);
  return { error: null };
}

// Commit the reviewed rows as whiteboard-sourced results. Respects the dedup rule
// (a member's own self-logged result wins, so we skip those) and writes through
// the service-role client since source='whiteboard' is not member-writable.
export async function commitWhiteboard(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const uploadId = Number(formData.get("upload_id"));
  const sessionId = Number(formData.get("session_id"));
  const count = Number(formData.get("count"));
  if (!Number.isInteger(uploadId) || !Number.isInteger(sessionId)) return;

  const admin = createAdminClient();

  // Members who already self-logged keep their entry (self beats whiteboard).
  const { data: selfRows } = await admin
    .from("results")
    .select("profile_id")
    .eq("session_id", sessionId)
    .eq("source", "self");
  const selfLogged = new Set((selfRows ?? []).map((r) => r.profile_id));

  // Last write wins if a member is mapped to two rows.
  const byMember = new Map<
    string,
    { value_text: string; rx: boolean }
  >();
  for (let i = 0; i < count; i++) {
    const member = String(formData.get(`member_${i}`) ?? "");
    const score = String(formData.get(`score_${i}`) ?? "").trim();
    if (!member || !score || selfLogged.has(member)) continue;
    byMember.set(member, {
      value_text: score,
      rx: String(formData.get(`rx_${i}`) ?? "") === "rx",
    });
  }

  const rows = [...byMember.entries()].map(([profile_id, r]) => ({
    session_id: sessionId,
    profile_id,
    score_type: "text" as const,
    value: null,
    value_text: r.value_text,
    rx: r.rx,
    source: "whiteboard" as const,
    verified: true,
  }));
  if (rows.length) {
    await admin
      .from("results")
      .upsert(rows, { onConflict: "session_id,profile_id" });
  }

  // Fill in the session's WOD from the board if it doesn't have one yet.
  const wod = String(formData.get("workout_description") ?? "").trim();
  if (wod) {
    const { data: sess } = await admin
      .from("sessions")
      .select("wod_description")
      .eq("id", sessionId)
      .maybeSingle();
    if (sess && !(sess as { wod_description: string | null }).wod_description) {
      await admin
        .from("sessions")
        .update({ wod_description: wod })
        .eq("id", sessionId);
    }
  }

  await admin
    .from("whiteboard_uploads")
    .update({ review_status: "reviewed" })
    .eq("id", uploadId);

  revalidatePath(`/session/${sessionId}`);
}

// Discard a pending parse and delete the stored photo.
export async function discardWhiteboard(formData: FormData) {
  const me = await requireStaff();
  if (!me) return;

  const uploadId = Number(formData.get("upload_id"));
  const sessionId = Number(formData.get("session_id"));
  if (!Number.isInteger(uploadId)) return;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("whiteboard_uploads")
    .select("photo_path")
    .eq("id", uploadId)
    .maybeSingle();
  if (row) {
    await admin.storage
      .from(BUCKET)
      .remove([(row as { photo_path: string }).photo_path]);
  }
  await admin
    .from("whiteboard_uploads")
    .update({ review_status: "discarded" })
    .eq("id", uploadId);

  revalidatePath(`/session/${sessionId}`);
}
