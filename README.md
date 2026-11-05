# Platform Bot Discord — Modul Moderasi, Selamat Datang, Tiket, Logging, Utilitas, Custom Command, Leveling, Ekonomi, Webhook, Quiz

Monorepo pnpm: `apps/web` (Next.js 15), `apps/api` (Express), `apps/worker` (discord.js v14), `packages/core` (Drizzle + Zod + kripto + Redis).

## Jalankan (produksi, Docker)

```bash
cp .env.example .env      # isi DISCORD_CLIENT_ID/SECRET + secrets (lihat komentar)
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm worker pnpm --filter @platform/core db:push
# buka http://localhost:3000
```

## Jalankan (dev)

```bash
docker compose up -d
pnpm install
pnpm db:push
pnpm check
pnpm dev
```

Token bot TIDAK pernah tampil penuh setelah disimpan (AES-256-GCM, hanya 4 karakter akhir).
