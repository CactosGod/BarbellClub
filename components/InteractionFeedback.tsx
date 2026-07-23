"use client";

import { useEffect } from "react";

const INTERACTIVE_SELECTOR =
  'a[href], button:not(:disabled), [role="button"]:not([aria-disabled="true"])';

/**
 * Adds a short vibration for taps on interactive controls when the browser
 * supports the Vibration API (primarily Android). iOS Safari does not expose
 * web haptics, so the global CSS pressed state is the fallback there.
 */
export default function InteractionFeedback() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(INTERACTIVE_SELECTOR)) {
        return;
      }
      navigator.vibrate?.(8);
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return null;
}
