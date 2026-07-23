import { getBuildVersionLabel } from "@/lib/version";

/** Small footer line for pre-auth screens. */
export default function BuildVersion() {
  return (
    <p className="pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 text-center text-[10px] tabular-nums text-neutral-600">
      {getBuildVersionLabel()}
    </p>
  );
}
