/** Build-time git label, injected via next.config.mjs. */
export function getBuildVersionLabel(): string {
  const ref = process.env.NEXT_PUBLIC_GIT_BRANCH || "local";
  const sha = process.env.NEXT_PUBLIC_GIT_SHA || "dev";
  const date = process.env.NEXT_PUBLIC_GIT_DATE;
  return date ? `${ref} (${sha}) - ${date}` : `${ref} (${sha})`;
}
