import { execSync } from "node:child_process";

function git(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const shaFull =
  process.env.VERCEL_GIT_COMMIT_SHA || git("git rev-parse HEAD") || "";
const branch =
  process.env.VERCEL_GIT_COMMIT_REF ||
  git("git rev-parse --abbrev-ref HEAD") ||
  "local";
const sha = shaFull ? shaFull.slice(0, 7) : "dev";
const date =
  git("git log -1 --format=%cs") ||
  new Date().toISOString().slice(0, 10);

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_GIT_BRANCH: branch,
    NEXT_PUBLIC_GIT_SHA: sha,
    NEXT_PUBLIC_GIT_DATE: date,
  },
  experimental: {
    // Whiteboard photo uploads go through a Server Action; default cap is 1 MB.
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    remotePatterns: [
      // Google account profile photos
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Supabase storage (whiteboard photos, later phases)
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
