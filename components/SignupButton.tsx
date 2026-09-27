"use client";

import { useActionState } from "react";
import { toggleSignup, type SignupState } from "@/app/session/actions";

const INITIAL: SignupState = { error: null };

// Sign up / Nilkkatulehdus pair. The two choices are mutually exclusive;
// tapping the active one clears the RSVP. Past sessions say "I was here"
// for the in-choice; the out label stays the club joke.
export default function SignupButton({
  sessionId,
  isSignedUp,
  isOut = false,
  isFull,
  past = false,
  size = "md",
}: {
  sessionId: number;
  isSignedUp: boolean;
  isOut?: boolean;
  isFull: boolean;
  past?: boolean;
  size?: "sm" | "md";
}) {
  const [state, action, pending] = useActionState(toggleSignup, INITIAL);
  const joinDisabled = pending || (!isSignedUp && isFull && !past);

  const base =
    size === "sm"
      ? "rounded-md px-2.5 py-1 text-xs font-medium"
      : "rounded-md px-3 py-2 text-sm font-medium";
  const joinTone = isSignedUp
    ? "bg-red text-white"
    : isFull && !past
      ? "border border-charcoal-700 text-neutral-500"
      : "bg-red text-white hover:bg-red/90";
  const outTone = isOut
    ? "border border-gold bg-gold/15 text-gold"
    : "border border-charcoal-700 text-neutral-300 hover:border-gold hover:text-gold";

  const joinLabel = pending
    ? "…"
    : past
      ? "I was here"
      : isFull && !isSignedUp
        ? "Full"
        : "Sign up";

  return (
    <form action={action} className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
      <input type="hidden" name="session_id" value={sessionId} />
      <div className="flex flex-wrap gap-1.5 sm:justify-end">
        <button
          type="submit"
          name="intent"
          value={isSignedUp ? "leave" : "join"}
          disabled={joinDisabled}
          className={`${base} ${joinTone} disabled:opacity-60`}
        >
          {joinLabel}
        </button>
        <button
          type="submit"
          name="intent"
          value={isOut ? "leave" : "out"}
          disabled={pending}
          className={`${base} ${outTone} disabled:opacity-60`}
        >
          {pending ? "…" : "Nilkkatulehdus"}
        </button>
      </div>
      {state.error && <span className="text-xs text-red">{state.error}</span>}
    </form>
  );
}
