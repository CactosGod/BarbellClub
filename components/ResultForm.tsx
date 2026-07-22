"use client";

import { useActionState, useState } from "react";
import {
  logResult,
  deleteResult,
  type ResultState,
} from "@/app/session/actions";
import { SCORE_TYPES, SCORE_TYPE_LABELS } from "@/lib/results";
import type { Result, ScoreType } from "@/lib/types";

const INITIAL: ResultState = { error: null };

const field =
  "mt-1 w-full rounded-md border border-charcoal-700 bg-charcoal px-2 py-1.5 text-sm";
const label = "block text-xs text-neutral-400";

// Split an existing result back into per-input defaults for editing.
function initialFields(r: Result | null) {
  const base = { minutes: "", seconds: "", rounds: "", reps: "", load: "", text: "" };
  if (!r) return base;
  if (r.score_type === "time" && r.value != null) {
    return {
      ...base,
      minutes: String(Math.floor(r.value / 60)),
      seconds: String(Math.floor(r.value % 60)),
    };
  }
  if (r.score_type === "rounds_reps") {
    const m = r.value_text.match(/(\d+)\s*\+\s*(\d+)/);
    return { ...base, rounds: m?.[1] ?? "", reps: m?.[2] ?? "" };
  }
  if (r.score_type === "load" && r.value != null) {
    return { ...base, load: String(r.value) };
  }
  return { ...base, text: r.value_text };
}

export default function ResultForm({
  sessionId,
  existing,
}: {
  sessionId: number;
  existing: Result | null;
}) {
  const [state, action, pending] = useActionState(logResult, INITIAL);
  const [scoreType, setScoreType] = useState<ScoreType>(
    existing?.score_type ?? "time",
  );
  const [rx, setRx] = useState<boolean>(existing?.rx ?? true);
  const defaults = initialFields(existing);

  return (
    <div className="rounded-lg border border-charcoal-700 bg-charcoal-800 p-4">
      <h2 className="heading text-lg text-gold">
        {existing ? "Your result" : "Log your result"}
      </h2>

      <form action={action} className="mt-3 space-y-3">
        <input type="hidden" name="session_id" value={sessionId} />
        <input type="hidden" name="rx" value={rx ? "true" : "false"} />

        <label className={label}>
          Score type
          <select
            name="score_type"
            value={scoreType}
            onChange={(e) => setScoreType(e.target.value as ScoreType)}
            className={field}
          >
            {SCORE_TYPES.map((t) => (
              <option key={t} value={t}>
                {SCORE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        {scoreType === "time" && (
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Minutes
              <input
                type="number"
                name="minutes"
                min={0}
                defaultValue={defaults.minutes}
                className={field}
              />
            </label>
            <label className={label}>
              Seconds
              <input
                type="number"
                name="seconds"
                min={0}
                max={59}
                defaultValue={defaults.seconds}
                className={field}
              />
            </label>
          </div>
        )}

        {scoreType === "rounds_reps" && (
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              Rounds
              <input
                type="number"
                name="rounds"
                min={0}
                defaultValue={defaults.rounds}
                className={field}
              />
            </label>
            <label className={label}>
              + Reps
              <input
                type="number"
                name="reps"
                min={0}
                defaultValue={defaults.reps}
                className={field}
              />
            </label>
          </div>
        )}

        {scoreType === "load" && (
          <label className={label}>
            Load (kg)
            <input
              type="number"
              name="load"
              min={0}
              step="0.5"
              defaultValue={defaults.load}
              className={field}
            />
          </label>
        )}

        {scoreType === "text" && (
          <label className={label}>
            Score
            <input
              name="text"
              defaultValue={defaults.text}
              placeholder="e.g. 3 rounds, 155 reps"
              className={field}
            />
          </label>
        )}

        {/* Rx / Scaled toggle */}
        <div className="flex gap-2">
          {[
            { on: true, text: "Rx" },
            { on: false, text: "Scaled" },
          ].map((opt) => (
            <button
              key={opt.text}
              type="button"
              onClick={() => setRx(opt.on)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                rx === opt.on
                  ? "bg-gold/15 text-gold ring-1 ring-gold/40"
                  : "border border-charcoal-700 text-neutral-400"
              }`}
            >
              {opt.text}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-red px-4 py-2 text-sm font-medium text-white hover:bg-red/90 disabled:opacity-60"
          >
            {pending ? "Saving…" : existing ? "Update result" : "Save result"}
          </button>
          {state.error && (
            <span className="text-xs text-red">{state.error}</span>
          )}
        </div>
      </form>

      {existing && (
        <form action={deleteResult} className="mt-3">
          <input type="hidden" name="session_id" value={sessionId} />
          <button className="text-xs text-neutral-500 hover:text-red">
            Delete result
          </button>
        </form>
      )}
    </div>
  );
}
