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
  logLevel: 'info',
});

// Font kartu quote dibaca relatif ke worker.js (./assets/fonts).
cpSync('apps/worker/assets/fonts', 'deploy/standalone/assets/fonts', { recursive: true });
