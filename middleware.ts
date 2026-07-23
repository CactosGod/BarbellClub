import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything except static assets. Auth logic lives in updateSession.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|manifest.json|sw.js|.*\\.(?:png|jpg|jpeg|gif|svg|webp)$).*)",
  ],
};
