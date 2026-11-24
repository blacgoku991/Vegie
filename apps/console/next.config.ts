import type { NextConfig } from "next";

const api = process.env.VIGIE_API_URL ?? "http://localhost:4000";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  transpilePackages: ["@vigie/shared"],
  // L'API est servie sous le même domaine que la console : cookie de session httpOnly, pas de CORS.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${api}/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
