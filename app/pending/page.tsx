import { redirect } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { getCurrentProfile } from "@/lib/auth";

// Holding screen for accounts that are not yet `active`.
export default async function PendingPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.status === "active") redirect("/");

  const inactive = profile.status === "inactive";

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <Wordmark size={80} showText={false} />
      <h1 className="heading mt-6 text-3xl">
        {inactive ? "Account inactive" : "Awaiting approval"}
      </h1>
      <p className="mt-3 text-neutral-400">
        {inactive
          ? "Your membership is marked inactive. Reach out to a coach to reactivate it."
          : "Thanks for signing in — a coach needs to approve your account before you can access the club portal."}
      </p>
      <p className="mt-6 text-sm text-neutral-500">
        Signed in as {profile.name}
      </p>
      <form action="/auth/signout" method="post" className="mt-6">
        <button className="text-sm text-neutral-400 hover:text-red">
          Sign out
        </button>
      </form>
    </main>
  );
}
