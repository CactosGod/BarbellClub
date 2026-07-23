import { redirect } from "next/navigation";
import BuildVersion from "@/components/BuildVersion";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import Wordmark from "@/components/Wordmark";
import { getCurrentProfile } from "@/lib/auth";
import { isConfigured } from "@/lib/env";

export default async function LoginPage() {
  // Already signed in → let the home route sort out where they belong.
  if (isConfigured()) {
    const profile = await getCurrentProfile();
    if (profile) redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-6 pt-[env(safe-area-inset-top)] text-center">
      <div className="flex flex-1 flex-col items-center justify-center">
        <Wordmark size={96} showText={false} />
        <h1 className="heading mt-6 text-4xl">
          Käpylä Maanantai
          <br />
          <span className="text-sunset">Barbell Club</span>
        </h1>
        <p className="mt-3 text-neutral-400">
          Schedule, results, PBs and leaderboards for club members.
        </p>

        <div className="mt-10 w-full">
          {isConfigured() ? (
            <GoogleSignInButton />
          ) : (
            <div className="rounded-lg border border-charcoal-700 bg-charcoal-800 p-4 text-left text-sm text-neutral-300">
              <p className="font-medium text-gold">Setup needed</p>
              <p className="mt-1">
                Add Supabase credentials to <code>.env.local</code> (copy{" "}
                <code>.env.local.example</code>) and restart the dev server to
                enable Google sign-in.
              </p>
            </div>
          )}
        </div>

        <p className="mt-8 text-xs text-neutral-500">
          New sign-ins are reviewed by a coach before you get access.
        </p>
      </div>
      <BuildVersion />
    </main>
  );
}
