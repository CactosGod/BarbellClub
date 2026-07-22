// Historical whiteboard backfill — reads the photos already in Supabase Storage
// (uploaded by the WhatsApp import), scrapes them with Claude vision, and loads
// the results as "unclaimed" rows that claim to members on signup.
//
//   node import/backfill.mjs scrape   # fills whiteboard_uploads.raw_parse (SPENDS API)
//   node import/backfill.mjs load     # rebuilds source='import' results (free)
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
// from .env.local. scrape is resumable (skips uploads that already have a parse).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const BUCKET = "whiteboard"; // where the WhatsApp import stored the photos
const MODEL = "claude-sonnet-5";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_whiteboard", "workout_description", "results"],
  properties: {
    is_whiteboard: { type: "boolean" },
    workout_description: { type: "string" },
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name_on_board", "matched_member", "confidence", "score", "rx"],
        properties: {
          name_on_board: { type: "string" },
          matched_member: { type: "string" },
          confidence: { type: "string", enum: ["high", "low"] },
          score: { type: "string" },
          rx: { type: "string", enum: ["rx", "scaled", "unknown"] },
        },
      },
    },
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mediaType(path) {
  const ext = path.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function prompt(date, roster) {
  return `This is a photo from a CrossFit gym on ${date || "an unknown date"}. If it
is a results whiteboard, read the workout description and every athlete's row.

Known member names (match against these if one fits; people write first names or
nicknames): ${roster.join(", ") || "(none)"}.

For each row: the name exactly as written on the board, your best roster match
(exact string from the list, or "" if none), confidence "high" or "low", the score
as written, and whether it was Rx ("rx"), scaled ("scaled"), or unmarked ("unknown").

If the photo is not a results whiteboard (people, gym, a meme, food), set
is_whiteboard=false, workout_description="", results=[].`;
}

async function scrape() {
  const { data: roster } = await db
    .from("profiles")
    .select("name")
    .eq("status", "active");
  const names = (roster ?? []).map((r) => r.name);

  const { data: pending } = await db
    .from("whiteboard_uploads")
    .select("id, session_id, photo_path")
    .is("raw_parse", null)
    .order("id");
  console.log(`scrape: ${pending.length} photos to read with ${MODEL}`);

  let ok = 0;
  let err = 0;
  for (const u of pending) {
    try {
      const { data: blob, error: dlErr } = await db.storage
        .from(BUCKET)
        .download(u.photo_path);
      if (dlErr) throw dlErr;
      const buf = Buffer.from(await blob.arrayBuffer());

      const { data: sess } = await db
        .from("sessions")
        .select("date")
        .eq("id", u.session_id)
        .maybeSingle();

      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType(u.photo_path),
                  data: buf.toString("base64"),
                },
              },
              { type: "text", text: prompt(sess?.date, names) },
            ],
          },
        ],
      });
      const text = msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parse = JSON.parse(text);
      await db.from("whiteboard_uploads").update({ raw_parse: parse }).eq("id", u.id);
      ok++;
    } catch (e) {
      err++;
      console.error(`  ERR upload ${u.id} (${u.photo_path}): ${e.message}`);
    }
    if ((ok + err) % 10 === 0) {
      console.log(`  ${ok + err}/${pending.length} (ok=${ok} err=${err})`);
    }
    await sleep(300);
  }
  console.log(`scrape done: ok=${ok} err=${err}`);
}

async function load() {
  const { data: uploads } = await db
    .from("whiteboard_uploads")
    .select("session_id, raw_parse");

  const rows = [];
  const seen = new Set(); // session|lowername — dedup unclaimed
  let boards = 0;
  for (const u of uploads ?? []) {
    const p = u.raw_parse;
    if (!p || !p.is_whiteboard) continue;
    boards++;
    for (const r of p.results ?? []) {
      const name = String(r.name_on_board ?? "").trim();
      const score = String(r.score ?? "").trim();
      if (!name || !score) continue;
      const key = `${u.session_id}|${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        session_id: u.session_id,
        profile_id: null,
        board_name: name,
        score_type: "text",
        value: null,
        value_text: score,
        rx: r.rx === "rx" || r.rx === true,
        source: "import",
        verified: true,
      });
    }
  }
  console.log(`load: ${boards} whiteboards → ${rows.length} import rows`);

  // Idempotent rebuild of import rows (self/whiteboard rows are untouched).
  const { error: delErr } = await db.from("results").delete().eq("source", "import");
  if (delErr) return console.error("delete failed:", delErr.message);

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("results").insert(rows.slice(i, i + 500));
    if (error) console.error(`insert chunk ${i}: ${error.message}`);
  }

  // Claim to any existing members.
  const { data: profs } = await db.from("profiles").select("id, name");
  for (const pr of profs ?? []) {
    const { data: n } = await db.rpc("claim_results", { uid: pr.id });
    console.log(`  claimed for ${pr.name}: ${n}`);
  }
  console.log("load done");
}

const cmd = process.argv[2];
if (cmd === "scrape") await scrape();
else if (cmd === "load") await load();
else {
  console.error("usage: node import/backfill.mjs <scrape|load>");
  process.exit(1);
}
