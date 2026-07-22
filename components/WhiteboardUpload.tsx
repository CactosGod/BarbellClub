"use client";

import { useActionState } from "react";
import {
  parseWhiteboard,
  type WhiteboardState,
} from "@/app/session/[id]/whiteboard";

const INITIAL: WhiteboardState = { error: null };

// Coach uploads a whiteboard photo; the action stores it and runs the vision
// parse, then the page re-renders into the review table.
export default function WhiteboardUpload({ sessionId }: { sessionId: number }) {
  const [state, action, pending] = useActionState(parseWhiteboard, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="session_id" value={sessionId} />
      <input
        type="file"
        name="photo"
        accept="image/*"
        capture="environment"
        className="block w-full text-sm text-neutral-300 file:mr-3 file:rounded-md file:border-0 file:bg-charcoal-700 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-red px-4 py-2 text-sm font-medium text-white hover:bg-red/90 disabled:opacity-60"
        >
          {pending ? "Reading whiteboard…" : "Upload & parse"}
        </button>
        {state.error && <span className="text-xs text-red">{state.error}</span>}
      </div>
      <p className="text-xs text-neutral-500">
        Claude reads the board; you review every row before anything is saved.
      </p>
    </form>
  );
}
