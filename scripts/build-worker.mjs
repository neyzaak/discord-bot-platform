// Build bundle worker untuk deploy/standalone/worker.js.
// Jalankan: pnpm build:worker
import { build } from 'esbuild';
import { cpSync } from 'node:fs';

await build({
  entryPoints: ['apps/worker/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['@napi-rs/canvas', 'pg-native'],
  banner: {
    js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);",
  },
  outfile: 'deploy/standalone/worker.js',
  // Latar quote di-embed base64 supaya tidak bergantung pada folder assets saat upload.
  loader: { '.png': 'base64' },
  logLevel: 'info',
});

// Aset kartu quote (font + latar) dibaca relatif ke worker.js (./assets).
cpSync('apps/worker/assets', 'deploy/standalone/assets', { recursive: true });
