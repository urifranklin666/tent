import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: [
    "pg",
    "pg-native",
    "libsodium-wrappers",
    "libsodium",
    "ssh2",
    "@tent/core",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default config;
