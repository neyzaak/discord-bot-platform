// Konversi IndoMMLU (soal asli Indonesia, indolem/IndoMMLU) -> deploy/quiz-bank.json
// Hanya jenjang SD–SMP (soal relatif mudah), 4 pilihan (soal 5 opsi: buang 1 pengecoh acak).
// Pakai: node scripts/build-quiz-bank-id.mjs <IndoMMLU.csv> <out.json> [target=5000]
import fs from 'node:fs';

const csvPath = process.argv[2];
const out = process.argv[3];
const target = Number(process.argv[4] ?? 5000);
if (!csvPath || !out) { console.error('pakai: node build-quiz-bank-id.mjs <csv> <out.json> [target]'); process.exit(1); }

// --- parser CSV RFC4180 mini (field ber-quote, quote digandakan, newline di dalam quote) ---
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

// jenjang mudah saja; SMA/Seleksi PTN sengaja dibuang (terlalu susah untuk kuis santai)
const LEVELS = new Set([
  'SD', 'Kelas I SD', 'Kelas II SD', 'Kelas III SD', 'Kelas IV SD',
  'V SD', 'VI SD', 'SD-SMP', 'SD-SMP-SMA',
  'SMP', 'VII SMP', 'VIII SMP', 'IX SMP',
]);

const text = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(text);
const header = rows[0].map((h) => h.trim());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const seen = new Set();
const questions = [];
let skipped = 0;
const byLevel = {};

for (const r of rows.slice(1)) {
  const level = norm(r[idx.level] ?? '');
  if (!LEVELS.has(level)) { skipped++; continue; }
  if (norm(r[idx.is_for_fewshot] ?? '0') === '1') { skipped++; continue; }
  const question = norm(r[idx.soal] ?? '');
  // baris opsi: "A. teks", satu per baris di dalam sel
  const lines = String(r[idx.jawaban] ?? '').split('\n').map((l) => l.trim()).filter((l) => /^[A-E]\.\s*/.test(l));
  let opts = lines.map((l) => ({ letter: l[0], text: norm(l.slice(2)) }));
  const correctLetter = String(r[idx.kunci] ?? '').trim().toUpperCase()[0];
  const ci0 = opts.findIndex((o) => o.letter === correctLetter);
  if (!question || opts.length < 4 || ci0 < 0) { skipped++; continue; }
  const correctOpt = opts[ci0];
  if (opts.length > 4) {
    // buang satu pengecoh secara acak supaya tersisa tepat 4 pilihan
    const wrongIdx = opts.map((_, i) => i).filter((i) => i !== ci0);
    const drop = wrongIdx[Math.floor(Math.random() * wrongIdx.length)];
    opts = opts.filter((_, i) => i !== drop);
  }
  const choices = opts.map((o) => o.text);
  if (choices.some((c) => !c)) { skipped++; continue; }
  if (question.length > 300 || choices.some((c) => c.length > 100)) { skipped++; continue; }
  if (new Set(choices.map((c) => c.toLowerCase())).size !== 4) { skipped++; continue; }
  const key = question.toLowerCase();
  if (seen.has(key)) { skipped++; continue; }
  seen.add(key);
  const correctText = correctOpt.text;
  shuffle(choices);
  questions.push({ question, choices, correctIndex: choices.indexOf(correctText), explanation: '' });
  byLevel[level] = (byLevel[level] || 0) + 1;
}

shuffle(questions);
const bank = questions.slice(0, target);

fs.writeFileSync(out, JSON.stringify({
  source: 'IndoMMLU — soal asli Indonesia (indolem/IndoMMLU), jenjang SD–SMP — huggingface.co/datasets/indolem/IndoMMLU',
  generatedAt: new Date().toISOString(),
  count: bank.length,
  questions: bank,
}, null, 1) + '\n');

console.log(`lolos filter: ${questions.length}, dilewati: ${skipped}, ditulis: ${bank.length}`);
console.log('per jenjang:', JSON.stringify(byLevel));
