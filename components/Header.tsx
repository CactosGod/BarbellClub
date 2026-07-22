import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { isStaff, type Profile } from "@/lib/types";

// App header. Phase 1 nav is intentionally minimal (profile, coach, sign out);
// schedule/leaderboard links arrive with later phases.
export default function Header({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-10 border-b border-charcoal-700 bg-charcoal/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Home">
          <Wordmark size={34} />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {isStaff(profile.role) && (
            <Link href="/coach" className="text-neutral-300 hover:text-white">
              Coach
            </Link>
          )}
          <Link
            href={`/profile/${profile.id}`}
            className="text-neutral-300 hover:text-white"
          >
            Profile
          </Link>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-neutral-400 hover:text-red"
              aria-label="Sign out"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
