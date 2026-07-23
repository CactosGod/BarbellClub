"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_DAYS = 21;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  // iOS Safari
  const ios = "standalone" in navigator && (navigator as { standalone?: boolean }).standalone;
  return mq || !!ios;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notOther = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit && notOther;
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000),
    );
  } catch {
    /* ignore */
  }
}

export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;

    // Register SW (helps Chromium install criteria).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* non-fatal */
      });
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (isIosSafari()) {
      setShowIos(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!visible) return null;

  const close = () => {
    dismiss();
    setVisible(false);
    setDeferred(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-charcoal-700 bg-charcoal-800/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-white">Install Barbell Club</p>
          {showIos && !deferred ? (
            <p className="mt-0.5 text-neutral-400">
              Tap Share, then <span className="text-neutral-200">Add to Home Screen</span>{" "}
              for quick access.
            </p>
          ) : (
            <p className="mt-0.5 text-neutral-400">
              Add to your home screen for one-tap schedule and results.
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-md border border-charcoal-700 px-3 py-1.5 text-sm text-neutral-400 hover:text-white"
          >
            Not now
          </button>
          {deferred && (
            <button
              type="button"
              onClick={install}
              className="rounded-md bg-red px-3 py-1.5 text-sm font-medium text-white hover:bg-red/90"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
