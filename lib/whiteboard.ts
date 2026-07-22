import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { WhiteboardParse } from "@/lib/types";

// Strict output schema — mirrors import/import_whatsapp.py. All-string fields keep
// the structured-output schema within its supported subset (no nullable unions).
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
} as const;

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function prompt(date: string, roster: string[], attendees: string[]): string {
  return `This is a photo from a CrossFit gym on ${date}. If it is a results
whiteboard, read the workout description and every athlete's row.

People signed up for this session: ${attendees.join(", ") || "(none recorded)"}.
Known member names (match against these — people write first names or nicknames):
${roster.join(", ")}.

For each row, give the name as written on the board, your best roster match
(exact string from the list above, or "" if none is a confident match), a
confidence of "high" or "low", the score exactly as written, and whether it was
Rx ("rx"), scaled ("scaled"), or unmarked ("unknown").

If the photo is not a results whiteboard (people, gym, a meme, food), set
is_whiteboard to false, workout_description to "", and results to [].`;
}

// Send a whiteboard photo to Claude vision and return the strict parse. Throws on
// an API error or malformed response so the caller can surface it.
export async function parseWhiteboardImage(opts: {
  base64: string;
  mediaType: ImageMediaType;
  date: string;
  roster: string[];
  attendees: string[];
}): Promise<WhiteboardParse> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: opts.mediaType,
              data: opts.base64,
            },
          },
          { type: "text", text: prompt(opts.date, opts.roster, opts.attendees) },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as WhiteboardParse;
}
