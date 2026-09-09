import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      cesium: "cesium",
    },
  },
};

export default nextConfig;