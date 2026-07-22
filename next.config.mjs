/** @type {import('next').NextConfig} */
const nextConfig = {
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
