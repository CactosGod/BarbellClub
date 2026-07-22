"use client";

import {
  commitWhiteboard,
  discardWhiteboard,
} from "@/app/session/[id]/whiteboard";
import type { WhiteboardParse } from "@/lib/types";

type RosterMember = { id: string; name: string };

const field =
  "rounded-md border border-charcoal-700 bg-charcoal px-2 py-1 text-sm";

// Best-effort map of a parsed name guess to a roster id (exact, case-insensitive).
function guessId(name: string, roster: RosterMember[]): string {
  const m = roster.find(
    (r) => r.name.toLowerCase() === name.trim().toLowerCase(),
  );
  return m?.id ?? "";
}

export default function WhiteboardReview({
  sessionId,
  uploadId,
  photoUrl,
  parse,
  roster,
}: {
  sessionId: number;
  uploadId: number;
  photoUrl: string | null;
  parse: WhiteboardParse;
  roster: RosterMember[];
}) {
  const empty = !parse.is_whiteboard || parse.results.length === 0;

  return (
    <div className="space-y-4">
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Uploaded whiteboard"
          className="max-h-72 w-full rounded-lg border border-charcoal-700 object-contain"
        />
      )}

      {/* The commit and discard forms are siblings (forms can't nest); their
          submit buttons live in the shared button row below via `form=`. */}
      {!empty && (
        <form id="wb-commit" action={commitWhiteboard} className="space-y-3">
          <input type="hidden" name="upload_id" value={uploadId} />
          <input type="hidden" name="session_id" value={sessionId} />
          <input type="hidden" name="count" value={parse.results.length} />
          <input
            type="hidden"
            name="workout_description"
            value={parse.workout_description}
          />

          {parse.workout_description && (
            <p className="whitespace-pre-wrap rounded-md border border-charcoal-700 bg-charcoal p-3 text-sm text-neutral-300">
              {parse.workout_description}
            </p>
          )}

          <ul className="space-y-2">
            {parse.results.map((r, i) => (
              <li
                key={i}
                className={`rounded-lg border p-3 ${
                  r.confidence === "low"
                    ? "border-gold/40 bg-gold/5"
                    : "border-charcoal-700 bg-charcoal-800"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    Board: <span className="font-medium">{r.name_on_board}</span>
                  </span>
                  {r.confidence === "low" && (
                    <span className="text-xs text-gold">check match</span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select
                    name={`member_${i}`}
                    defaultValue={guessId(r.matched_member, roster)}
                    className={field}
                    aria-label="Member"
                  >
                    <option value="">— skip —</option>
                    {roster.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    name={`score_${i}`}
                    defaultValue={r.score}
                    placeholder="Score"
                    className={field}
                    aria-label="Score"
                  />
                  <select
                    name={`rx_${i}`}
                    defaultValue={r.rx === "rx" ? "rx" : "scaled"}
                    className={field}
                    aria-label="Rx or scaled"
                  >
                    <option value="rx">Rx</option>
                    <option value="scaled">Scaled</option>
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </form>
      )}

      {/* Discard form — sibling of the commit form. */}
      <form id="wb-discard" action={discardWhiteboard}>
        <input type="hidden" name="upload_id" value={uploadId} />
        <input type="hidden" name="session_id" value={sessionId} />
      </form>

      {empty ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-charcoal-700 bg-charcoal-800 p-3">
          <p className="text-sm text-neutral-400">
            No result rows were detected in this photo.
          </p>
          <button
            type="submit"
            form="wb-discard"
            className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-400 hover:border-red hover:text-red"
          >
            Discard
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              form="wb-commit"
              className="rounded-md bg-red px-4 py-2 text-sm font-medium text-white hover:bg-red/90"
            >
              Commit results
            </button>
            <button
              type="submit"
              form="wb-discard"
              className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-400 hover:border-red hover:text-red"
            >
              Discard
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            Rows set to “skip”, or members who already logged their own result,
            are left untouched.
          </p>
        </>
      )}
    </div>
  );
}
