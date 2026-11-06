// Cek typo bank soal terhadap KBBI V. READ-ONLY: hanya laporan, tidak mengubah bank.
// pakai: node scripts/kbbi-check.mjs <kbbi_v.csv> <deploy/quiz-bank.json> [out.txt]
import fs from 'node:fs';

const [csvPath, bankPath, outPath] = process.argv.slice(2);
if (!csvPath || !bankPath) {
  console.error('pakai: node kbbi-check.mjs <kbbi_v.csv> <quiz-bank.json> [out.txt]');
  process.exit(1);
}

// --- parser CSV RFC4180 mini ---
function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// --- kamus: semua kata dari semua kolom (dataset tidak punya semua lemma tunggal) ---
const dict = new Set();
const addWord = (raw) => {
  const w = String(raw).toLowerCase().trim();
  if (!w || w.startsWith('-') || w.endsWith('-')) return; // penanda imbuhan, bukan kata
  for (const t of w.split(/[^a-z\u00C0-\u024F]+/)) if (t.length > 1) dict.add(t);
};
{
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const h = rows[0].map((x) => x.trim());
  const cols = ['nama', 'key', 'kata_dasar', 'kata_turunan', 'gabungan_kata']
    .map((c) => h.indexOf(c)).filter((i) => i >= 0);
  for (const r of rows.slice(1)) for (const i of cols) addWord(r[i] ?? '');
}

// --- pelepasan imbuhan (longgar: tujuan cuma menekan false positive) ---
const PREFIX = [
  ['memper', ''], ['diper', ''], ['keber', ''], ['berke', ''], ['menge', ''], ['penge', ''],
  ['meng', 'k'], ['meny', 's'], ['mem', 'p'], ['men', 't'], ['peng', 'k'], ['peny', 's'],
  ['pem', 'p'], ['pen', 't'], ['ber', ''], ['ter', ''], ['per', ''], ['pel', ''],
  ['me', ''], ['pe', ''], ['di', ''], ['ke', ''], ['se', ''],
];
const SUFFIX = ['kannya', 'annya', 'kan', 'nya', 'an', 'i', 'lah', 'kah', 'pun', 'ku', 'mu'];
const inDict = (w) => dict.has(w);

function known(word, depth = 0) {
  if (inDict(word)) return true;
  if (depth > 2 || word.length < 3) return false;
  // bentuk ulang tanpa tanda hubung: negaranegara
  if (word.length % 2 === 0) {
    const half = word.slice(0, word.length / 2);
    if (half === word.slice(word.length / 2) && known(half, depth + 1)) return true;
  }
  // buang akhiran
  for (const s of SUFFIX) {
    if (word.endsWith(s) && word.length - s.length >= 3 && known(word.slice(0, -s.length), depth + 1)) return true;
  }
  // buang awalan (kadang huruf pertama luluh: meng+kirim -> mengirim)
  for (const [p, restore] of PREFIX) {
    if (!word.startsWith(p) || word.length - p.length < 3) continue;
    const rest = word.slice(p.length);
    if (known(rest, depth + 1)) return true;
    if (restore && known(restore + rest, depth + 1)) return true;
  }
  // bentuk ulang berhubung: kanak-kanak / sia-sia
  const parts = word.split('-');
  if (parts.length > 1 && parts.every((p) => !p || known(p, depth + 1))) return true;
  return false;
}

// --- tokenisasi bank ---
const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
const freq = new Map();
const sample = new Map();
const proper = new Map();
const corpus = new Map(); // semua token (untuk menilai kata pengganti itu umum dipakai atau tidak)
let tokenCount = 0;

for (const q of bank.questions) {
  for (const text of [q.question, ...q.choices]) {
    for (const tok of text.match(/[A-Za-z\u00C0-\u024F]+/g) || []) {
      tokenCount++;
      const lower = tok.toLowerCase();
      corpus.set(lower, (corpus.get(lower) || 0) + 1);
      if (tok.length <= 2 || /\d/.test(tok)) continue;
      if (known(lower)) continue;
      const isCapital = /^[A-Z]/.test(tok);
      const target = isCapital ? proper : freq; // kapital = mungkin nama diri, dipisah
      target.set(lower, (target.get(lower) || 0) + 1);
      if (!sample.has(lower)) sample.set(lower, `${q.question} || ${q.choices.join(' | ')}`.slice(0, 160));
    }
  }
}

// --- usulan: kata harus dipisah vs mirip kata kamus ---
// usulan pisah hanya kalau bagian pertama kata fungsi umum (di wilayah, orang tua)
const FUNC = new Set(['di', 'ke', 'dari', 'pada', 'untuk', 'dengan', 'yang', 'dan', 'atau', 'ini', 'itu',
  'tidak', 'bukan', 'sudah', 'telah', 'akan', 'sedang', 'sangat', 'lebih', 'paling', 'harus', 'bisa',
  'dapat', 'juga', 'masih', 'para', 'setiap', 'semua', 'agar', 'supaya', 'karena', 'sebagai', 'oleh',
  'dalam', 'antara', 'setelah', 'sebelum', 'ketika', 'saat', 'secara', 'tanpa', 'bagi', 'orang', 'antar']);
const splitOk = (w) => {
  for (let i = 2; i <= w.length - 3; i++) {
    const a = w.slice(0, i), b = w.slice(i);
    if (FUNC.has(a) && inDict(b)) return `${a} ${b}`;
  }
  return null;
};
const lev = (a, b, max) => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
};
const nearest = (w) => {
  let best = null, bestD = 3, bestCommon = false;
  const first = w[0];
  for (const cand of dict) {
    if (cand[0] !== first) continue;
    const d = lev(w, cand, 2);
    if (d > 2) continue;
    const common = (corpus.get(cand) || 0) >= 2;
    if (d < bestD || (d === bestD && common && !bestCommon)) {
      bestD = d; best = cand; bestCommon = common;
    }
  }
  return best && bestD <= 2 ? { word: best, dist: bestD, common: bestCommon } : null;
};

const unknown = [...freq.entries()].sort((a, b) => b[1] - a[1]);
const suggest = new Map();
for (const [w] of unknown) {
  const fix = splitOk(w);
  if (fix) { suggest.set(w, { text: `pisah: "${fix}"`, confident: true }); continue; }
  const n = nearest(w);
  if (n) suggest.set(w, {
    text: `mirip: ${n.word} (jarak ${n.dist}${n.common ? ', kata ini dipakai di bank' : ''})`,
    confident: n.dist === 1 && n.common,
  });
}

const confident = unknown.filter(([w]) => suggest.get(w)?.confident);
const lines = [];
lines.push(`kata di kamus: ${dict.size}`);
lines.push(`token diperiksa: ${tokenCount}`);
lines.push(`kata tidak dikenal (bukan kapital): ${unknown.length} unik, ${unknown.reduce((s, x) => s + x[1], 0)} kemunculan`);
lines.push(`kata kapital tak dikenal (kemungkinan nama diri, diabaikan): ${proper.size} unik`);
lines.push('');
lines.push(`=== KANDIDAT TYPO YAKIN (${confident.length} kata, ${confident.reduce((s, x) => s + x[1], 0)} kemunculan) ===`);
for (const [w, n] of confident) {
  lines.push(`${w} -> ${suggest.get(w).text}   (${n}x)`);
  lines.push(`     ${sample.get(w)}`);
}
lines.push('');
lines.push('=== semua kata tidak dikenal (urut frekuensi) ===');
for (const [w, n] of unknown) {
  lines.push(`${String(n).padStart(4)}x  ${w.padEnd(22)} ${suggest.get(w)?.text ?? ''}`);
  lines.push(`       ${sample.get(w)}`);
}

const report = lines.join('\n');
if (outPath) fs.writeFileSync(outPath, report);
console.log(lines.slice(0, 4).join('\n'));
console.log(`\n=== KANDIDAT TYPO YAKIN: ${confident.length} kata ===`);
for (const [w, n] of confident) console.log(`${String(n).padStart(3)}x ${w.padEnd(20)} -> ${suggest.get(w).text}`);
if (outPath) console.log(`\nlaporan lengkap: ${outPath}`);
