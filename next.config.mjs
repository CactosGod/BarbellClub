/** @type {import('next').NextConfig} */
const nextConfig = {
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
