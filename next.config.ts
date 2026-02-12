import type { NextConfig } from "next";

let supabaseHostname = "";
try {
  const url = process.env.SUPABASE_URL;
  if (url) supabaseHostname = new URL(url).hostname;
} catch {
  // SUPABASE_URL not set or invalid — skip image config
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [{ protocol: "https" as const, hostname: supabaseHostname, pathname: "/storage/v1/object/public/**" }]
        : []),
      { protocol: "https" as const, hostname: "**" },
    ],
  },
};

export default nextConfig;
