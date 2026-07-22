import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ensureProfile } from "@/lib/auth";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// OAuth redirect target. Exchanges the code for a session, then makes sure a
// profiles row exists (new users start as `pending`).
//
// The Supabase auth cookies must be written onto the redirect response we return
// here — not the next/headers store — or they're dropped and the user lands back
// on /login with no session. So we build a client whose setAll targets that
// response directly.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  // The response whose Set-Cookie headers carry the new session to the browser.
  const response = NextResponse.redirect(`${origin}${next}`);
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await ensureProfile(user);

  // Session cookies are now attached to `response`; the browser keeps them
  // through the redirect. A pending user hitting "/" is then routed to /pending.
  return response;
}
