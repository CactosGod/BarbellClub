import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import EditableName from "@/components/EditableName";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import type { Profile } from "@/lib/types";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-charcoal-700 bg-charcoal-800 px-3 py-1 text-xs uppercase tracking-wide text-neutral-300">
      {children}
    </span>
  );
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getCurrentProfile();
  if (!viewer) redirect("/login");
  if (viewer.status !== "active") redirect("/pending");

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const profile = data as Profile | null;
  if (!profile) notFound();

  const isOwner = viewer.id === profile.id;

  return (
    <>
      <Header profile={viewer} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-5">
          {profile.photo_url ? (
            <Image
              src={profile.photo_url}
              alt={profile.name}
              width={80}
              height={80}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-charcoal-700 text-2xl">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            {isOwner ? (
              <EditableName id={profile.id} name={profile.name} />
            ) : (
              <h1 className="heading text-3xl">{profile.name}</h1>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{profile.role}</Badge>
              <Badge>{profile.status}</Badge>
              {profile.joined_at && (
                <Badge>joined {profile.joined_at}</Badge>
              )}
            </div>
          </div>
        </div>

        <section className="mt-10 rounded-lg border border-charcoal-700 bg-charcoal-800 p-6 text-neutral-400">
          <h2 className="heading text-lg text-white">History &amp; PBs</h2>
          <p className="mt-2 text-sm">
            Personal bests, result history and progress charts arrive in phase 4.
          </p>
        </section>
      </main>
    </>
  );
}
