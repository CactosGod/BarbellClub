import { redirect } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { getCurrentProfile } from "@/lib/auth";
import { isStaff } from "@/lib/types";

// Phase 1 home. Later phases replace the body with the week-view schedule.
export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/pending");

  return (
    <>
      <Header profile={profile} />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="heading text-3xl">
          Welcome, <span className="text-sunset">{profile.name}</span>
        </h1>
        <p className="mt-2 text-neutral-400">
          You&apos;re in. The schedule, results and leaderboards land in the next
          phases.
        </p>

        {isStaff(profile.role) && (
          <Link
            href="/coach"
            className="mt-8 inline-block rounded-lg bg-red px-4 py-2 font-medium text-white hover:bg-red/90"
          >
            Go to coach tools →
          </Link>
        )}
      </main>
    </>
  );
}
