import type { ScoreType } from "@/lib/types";

export const SCORE_TYPES: ScoreType[] = ["time", "rounds_reps", "load", "text"];

export const SCORE_TYPE_LABELS: Record<ScoreType, string> = {
  time: "Time",
  rounds_reps: "Rounds + reps",
  load: "Load",
  text: "Other",
};

// seconds → "m:ss" (or "h:mm:ss" for long efforts).
export function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export interface ScoreFields {
  minutes?: string;
  seconds?: string;
  rounds?: string;
  reps?: string;
  load?: string;
  text?: string;
}

// Turn raw form fields into a stored { value, value_text }. `value` is a sortable
// number (seconds / kg / a rounds.reps proxy); `value_text` is the canonical
// display string. Returns null when input is empty/invalid so the caller rejects.
export function parseScore(
  scoreType: ScoreType,
  fields: ScoreFields,
): { value: number | null; value_text: string } | null {
  switch (scoreType) {
    case "time": {
      const m = Math.max(0, Math.floor(Number(fields.minutes) || 0));
      const s = Math.max(0, Math.floor(Number(fields.seconds) || 0));
      const total = m * 60 + s;
      if (total <= 0) return null;
      return { value: total, value_text: formatSeconds(total) };
    }
    case "rounds_reps": {
      const rounds = Math.max(0, Math.floor(Number(fields.rounds) || 0));
      const reps = Math.max(0, Math.floor(Number(fields.reps) || 0));
      if (rounds <= 0 && reps <= 0) return null;
      // Sortable proxy: whole rounds + fractional reps. Exact leaderboard
      // ordering (needs each WOD's rep scheme) is revisited in Phase 4.
      return { value: rounds + reps / 1000, value_text: `${rounds} + ${reps}` };
    }
    case "load": {
      const kg = Number(fields.load);
      if (!Number.isFinite(kg) || kg <= 0) return null;
      return { value: kg, value_text: `${kg} kg` };
    }
    case "text": {
      const t = (fields.text ?? "").trim();
      if (!t) return null;
      return { value: null, value_text: t };
    }
  }
}
