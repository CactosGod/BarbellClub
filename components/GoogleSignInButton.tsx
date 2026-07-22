"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GoogleSignInButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${
      next ? `?next=${encodeURIComponent(next)}` : ""
    }`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser is redirected to Google.
  }

  return (
    <div className="w-full">
      <button
        onClick={signIn}
        disabled={loading}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-medium text-charcoal transition hover:bg-neutral-200 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.3 13.3 17.7 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-17.4z"
          />
          <path
            fill="#FBBC05"
            d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.5 10.7l7.9-6.1z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.4-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.3 0-11.7-3.8-13.6-9.4l-7.9 6.1C6.4 42.6 14.6 48 24 48z"
          />
        </svg>
        {loading ? "Redirecting…" : "Continue with Google"}
      </button>
      {error && <p className="mt-3 text-sm text-red">{error}</p>}
    </div>
  );
}
