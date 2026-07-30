/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits .next/standalone — a self-contained server plus only the traced
  // node_modules, so the Docker image doesn't need a full `npm install`.
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
