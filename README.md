# Platform Bot Discord

Platform multi-tenant untuk membuat dan mengelola bot Discord dari dashboard web — tanpa coding. Satu bot bisa mengaktifkan modul moderasi, tiket, leveling, ekonomi, kuis, KTP, dan lainnya lewat UI.

Monorepo pnpm:

| Paket | Isi |
| --- | --- |
| `apps/web` | Dashboard Next.js 15 (login Discord, kelola bot, konfigurasi modul, monitoring) |
| `apps/api` | REST API Express (auth, bot, webhook, integrasi) |
| `apps/worker` | Runner discord.js v14 — menyalakan bot sesuai konfigurasi di database |
| `packages/core` | Drizzle schema, Zod config, enkripsi token, Redis, logger (dipakai bersama) |

## Modul

11 modul yang bisa dinyalakan per bot:

| Modul | Fitur |
| --- | --- |
| `welcome` | Pesan selamat datang/keluar, auto-role |
| `moderation` | `kick`, `ban`, `timeout`, `clear` + log aksi |
| `tickets` | Panel tiket, buka/tutup/klaim, transkrip |
| `logging` | Log pesan edit/hapus, join/leave, perubahan member |
| `utilities` | `ping`, `avatar`, `userinfo`, `serverinfo`, `calc`, `weather` |
| `customcmd` | Command teks buatan sendiri (nama + respons) |
| `leveling` | XP dari chat, `rank`, `leaderboard`, hadiah level |
| `economy` | `balance`, `daily`, `work`, `transfer`, `shop`, `buy` |
| `webhooks` | Kirim event keluar ke URL webhook |
| `quiz` | Kuis pilihan ganda interaktif (bank soal Indonesia SD–SMP) |
| `ktp` | Kartu identitas server (`/ktpset`, `/ktp`) yang digambar jadi PNG |

## Command

Slash command didaftarkan **per-guild** saat bot online (dan saat join server baru), jadi perubahan langsung terlihat tanpa menunggu cache global Discord. Command teks juga tersedia memakai prefix bot (`/` default `!`).

```
/quiz start | stop | leaderboard
/ktpset [field] [value] [nama] [tempat] [tgllahir] [gender] [kota] [agama] [pekerjaan] [status]
/ktp [user]
/rank [user]        /leaderboard
/balance [user]     /daily   /work   /transfer <user> <amount>   /shop   /buy <item>
/kick <user> <reason>   /ban <user> <reason>   /timeout <user> <menit> <reason>   /clear <amount>
/ping   /avatar [user]   /userinfo [user]   /serverinfo   /calc <ekspresi>   /weather <kota>
/ticket <action> [user] [subject]
```

### Kuis

- Satu soal per sesi. Soal berikutnya hanya muncul saat `/quiz start` dipanggil lagi.
- Setelah waktu habis: jawaban benar diberi warna hijau, jawaban salah merah, penjelasan ditampilkan, semua tombol dikunci.
- Soal diambil acak dari tabel `bot_configs.data.quiz.questions` (JSONB) — bukan dikirim semua ke worker, jadi egress tetap kecil.
- Bank soal: **4384 soal** bahasa Indonesia (SD–SMP), 3–4 pilihan, tanpa soal berbau agama. Sumber: `deploy/quiz-bank.json`.
- Setiap soal mention role kuis di atas embed. Tidak ada teks di luar embed.
- Skor disimpan di `guild_members.quiz_score`, `/quiz leaderboard` menampilkan top 10.

Seed bank soal ke satu guild:

```bash
node scripts/seed-guild-quiz.mjs <guildId>
node scripts/verify-guild-quiz.mjs <guildId>
```

### KTP

- `/ktpset` menerima banyak field sekaligus; bisa juga format `field value` yang dipisah koma:

```
/ktpset nama=Budi Santoso, tempat=Jakarta, tgllahir=01-01-1990, agama=Kristen Katolik
```

- Data disimpan di `bot_configs.data.ktp` (JSONB) dan kartu langsung dikirim ke channel agar terlihat semua orang.
- Kartu dirender dengan `@napi-rs/canvas` mengikuti layout KTP. Jika canvas gagal dimuat, bot fallback ke embed teks.
- Pilihan agama: Islam, Kristen Katolik, Kristen Protestan, Hindu, Buddha, Konghucu.

## Jalankan (dev)

```bash
docker compose up -d          # Postgres + Redis
pnpm install
cp .env.example .env          # isi DISCORD_CLIENT_ID/SECRET + secret
pnpm db:push
pnpm check                    # validasi schema/config
pnpm dev                      # web :3000, api :4001, worker
```

## Jalankan (produksi, Docker)

```bash
cp .env.example .env
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm worker pnpm --filter @platform/core db:push
```

Buka `http://localhost:3000`, login dengan Discord, buat bot, tempel token, aktifkan modul. Worker akan menyalakan bot secara otomatis.

## Environment variable

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | ya | Postgres (Supabase/Neon/lokal) |
| `REDIS_URL` | ya | Redis (Upstash/lokal) — status bot & rate limit |
| `TOKEN_ENCRYPTION_KEY` | ya | 64 hex char (AES-256-GCM). **Jangan diubah** setelah ada bot terdaftar |
| `SESSION_SECRET` | ya | Secret cookie sesi dashboard |
| `DISCORD_CLIENT_ID` | ya | OAuth2 app untuk login dashboard |
| `DISCORD_CLIENT_SECRET` | ya | OAuth2 secret |
| `DISCORD_REDIRECT_URI` | ya | Default `http://localhost:3000/api/auth/callback` |
| `APP_URL` / `API_URL` / `API_PORT` | tidak | Default `localhost:3000` / `:4001` / `4001` |
| `PUBLIC_API_URL` | produksi | Origin API publik untuk URL webhook |
| `LOG_LEVEL` | tidak | Default `info` |

Generate secret: `openssl rand -hex 32`.

## Keamanan

- Token bot dienkripsi AES-256-GCM sebelum masuk database; API hanya mengembalikan 4 karakter terakhir. Token tidak pernah ditampilkan penuh.
- `.env` di-ignore dan tidak boleh masuk repo.
- Login dashboard lewat OAuth2 Discord; sesi ditandatangani `SESSION_SECRET`.
- Rate limit di API dan command worker.
- Error bot dicatat ke `command_logs` / tabel error, bukan crash proses.

## Skrip

```bash
pnpm dev            # semua app (parallel)
pnpm build          # build semua paket
pnpm typecheck      # tsc semua paket
pnpm db:push        # push schema Drizzle
pnpm check          # cek schema & config
```

`scripts/` berisi utilitas operasional: build bank soal (`build-quiz-bank-id.mjs`), cek KBBI (`kbbi-check.mjs`), seed/verify kuis, cek & hapus data guild, set modul KTP.

## Lisensi

MIT
