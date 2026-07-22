import type { ScoreType } from "@/lib/types";
import { formatSeconds } from "@/lib/results";

export type PbKind = "movement" | "benchmark";

// Does a lower score win for this type? Time is fastest-wins; load and
// rounds+reps are highest-wins; text isn't comparable.
export function lowerIsBetter(scoreType: ScoreType): boolean {
  return scoreType === "time";
}

// Is `candidate` a better result than `current` for this score type? A missing
// current PB counts as an improvement (first PB). Text is never comparable.
export function isBetter(
  scoreType: ScoreType,
  candidate: number | null,
  current: number | null | undefined,
): boolean {
  if (scoreType === "text" || candidate == null) return false;
  if (current == null) return true;
  return lowerIsBetter(scoreType) ? candidate < current : candidate > current;
}

// Parse a single free-text PB entry (from the profile form) into a stored
// { value, value_text } for the item's score type. Returns null when empty/invalid.
export function parsePbValue(
  scoreType: ScoreType,
  raw: string,
): { value: number | null; value_text: string } | null {
  const t = raw.trim();
  if (!t) return null;

  switch (scoreType) {
    case "load": {
      const n = parseFloat(t.replace(/kg/i, "").trim());
      if (!Number.isFinite(n) || n <= 0) return null;
      return { value: n, value_text: `${n} kg` };
    }
    case "time": {
      let secs: number;
      if (t.includes(":")) {
        const [m, s] = t.split(":");
        secs = (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
      } else {
        secs = parseInt(t, 10) || 0;
      }
      if (secs <= 0) return null;
      return { value: secs, value_text: formatSeconds(secs) };
    }
    case "rounds_reps": {
      const m = t.match(/(\d+)\s*\+\s*(\d+)/);
      const rounds = m ? +m[1] : parseInt(t, 10) || 0;
      const reps = m ? +m[2] : 0;
      if (rounds <= 0 && reps <= 0) return null;
      return { value: rounds + reps / 1000, value_text: `${rounds} + ${reps}` };
    }
    case "text":
      return { value: null, value_text: t };
  }
}
