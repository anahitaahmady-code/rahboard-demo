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
