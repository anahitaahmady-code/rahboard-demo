import type { NextConfig } from "next";

const repoName = "rahboard-demo";
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  ...(isVercel
    ? {}
    : {
        basePath: `/${repoName}`,
        assetPrefix: `/${repoName}/`,
      }),
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/sprint-report": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/telegram/webhook": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/weekly-report": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (!isVercel) return [];

    return [
      {
        source: `/${repoName}/api/:path*/`,
        destination: "/api/:path*/",
      },
      {
        source: `/${repoName}/api/:path*`,
        destination: "/api/:path*",
      },
      {
        source: `/${repoName}/:path*/`,
        destination: "/:path*/",
      },
      {
        source: `/${repoName}/:path*`,
        destination: "/:path*",
      },
    ];
  },
};

export default nextConfig;
