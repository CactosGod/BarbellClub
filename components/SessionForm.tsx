"use client";

import { isoToClubLocal } from "@/lib/schedule";
import type { Session } from "@/lib/types";

const field =
  "mt-1 w-full rounded-md border border-charcoal-700 bg-charcoal px-2 py-1.5 text-sm";
const label = "block text-xs text-neutral-400";

// Create / edit form for a session. The same fields serve both; passing `session`
// prefills values and adds a hidden id so the update action targets the row.
export default function SessionForm({
  action,
  session,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  session?: Session;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-3">
      {session && <input type="hidden" name="id" value={session.id} />}

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Date
          <input
            type="date"
            name="date"
            required
            defaultValue={session?.date ?? ""}
            className={field}
          />
        </label>
        <label className={label}>
          Time
          <input
            type="time"
            name="start_time"
            defaultValue={session?.start_time?.slice(0, 5) ?? "10:00"}
            className={field}
          />
        </label>
      </div>

      <label className={label}>
        Title
        <input
          name="title"
          defaultValue={session?.title ?? "Barbell Club"}
          className={field}
        />
      </label>

      <label className={label}>
        Workout (WOD)
        <textarea
          name="wod_description"
          rows={4}
          defaultValue={session?.wod_description ?? ""}
          className={field}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Capacity (blank = unlimited)
          <input
            type="number"
            name="capacity"
            min={1}
            defaultValue={session?.capacity ?? ""}
            className={field}
          />
        </label>
        <label className={label}>
          Reveal WOD at (optional)
          <input
            type="datetime-local"
            name="reveal_at"
            defaultValue={
              session?.reveal_at ? isoToClubLocal(session.reveal_at) : ""
            }
            className={field}
          />
        </label>
      </div>

      <button className="rounded-md bg-red px-4 py-2 text-sm font-medium text-white hover:bg-red/90">
        {submitLabel}
      </button>
    </form>
  );
}
