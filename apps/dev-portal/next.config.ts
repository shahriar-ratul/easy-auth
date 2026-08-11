import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // No floating dev badge — this panel is only ever run in dev, and the badge
  // sits on top of the page.
  devIndicators: false,
  // Don't auto-generate AGENTS.md/CLAUDE.md into the app directory on every dev/build run.
  agentRules: false,
  // Both DBML packages are CommonJS and the renderer loads graphviz as a wasm blob at
  // runtime. Leaving them out of the bundle keeps them as plain `require`s from
  // node_modules, which is the only way the wasm file resolves.
  serverExternalPackages: ["@dbml/core", "@softwaretechnik/dbml-renderer"],
};

export default nextConfig;
