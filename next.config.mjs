import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Multiple lockfiles exist above this app; without this, Turbopack picks the wrong root
  // and process.cwd()-relative reads (e.g. public/data/charts) fail → 500 on /artist, etc.
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/data/albums_master.json",
        destination: "/data/albums_enriched.json",
      },
    ]
  },
}

export default nextConfig
