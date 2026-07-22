// True when the public Supabase env vars are present. Lets the app boot and render
// the setup notice locally before credentials are wired up.
export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
