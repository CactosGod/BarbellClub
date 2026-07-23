"use client";

import { useActionState } from "react";
import { toggleSignup, type SignupState } from "@/app/session/actions";

const INITIAL: SignupState = { error: null };

// Sign up / cancel toggle. Uses useActionState so the server action can report a
// "session full" (or transient) error inline without a page-level navigation.
// Past sessions use retrospective copy ("I was here" / "I was not here").
export default function SignupButton({
  sessionId,
  isSignedUp,
  isFull,
  past = false,
  size = "md",
}: {
  sessionId: number;
  isSignedUp: boolean;
  isFull: boolean;
  past?: boolean;
  size?: "sm" | "md";
}) {
  const [state, action, pending] = useActionState(toggleSignup, INITIAL);
  // Capacity is for upcoming sessions; allow claiming past attendance even if "full".
  const disabled = pending || (!isSignedUp && isFull && !past);

  const base =
    size === "sm"
      ? "rounded-md px-3 py-1 text-xs font-medium"
      : "rounded-md px-4 py-2 text-sm font-medium";
  const tone = isSignedUp
    ? "border border-charcoal-700 text-neutral-300 hover:border-red hover:text-red"
    : isFull && !past
      ? "border border-charcoal-700 text-neutral-500"
      : "bg-red text-white hover:bg-red/90";

  let label: string;
  if (pending) label = "…";
  else if (isSignedUp) label = past ? "I was not here" : "Cancel";
  else if (isFull && !past) label = "Full";
  else label = past ? "I was here" : "Sign up";

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="intent" value={isSignedUp ? "leave" : "join"} />
      <button
        type="submit"
        disabled={disabled}
        className={`${base} ${tone} disabled:opacity-60`}
      >
        {label}
      </button>
      {state.error && <span className="text-xs text-red">{state.error}</span>}
    </form>
  );
}
