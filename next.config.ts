import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  transpilePackages: ["@tanstack/react-query"],
  allowedDevOrigins: ['172.18.3.171', '172.20.10.4', 'happy-shirts-divide.loca.lt', 'fancy-carrots-juggle.loca.lt', 'ripe-hairs-double.loca.lt'],
};

export default nextConfig;
