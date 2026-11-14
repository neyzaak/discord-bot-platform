// Build bundle API untuk Vercel (deploy/vercel-api/api/index.js).
// Jalankan: pnpm build:api
import { build } from 'esbuild';

await build({
  entryPoints: ['apps/api/src/app.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['pg-native'],
  banner: {
    js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);",
  },
  outfile: 'deploy/vercel-api/api/index.js',
  logLevel: 'info',
});
