// Konversi IndoMMLU (soal asli Indonesia, indolem/IndoMMLU) -> deploy/quiz-bank.json
// Hanya subjek berbahasa Indonesia tingkat SD–SMP (bahasa daerah/asing dibuang).
// 4 pilihan: soal 5 opsi dibuang 1 pengecoh acak; soal 3 opsi dipakai apa adanya.
// Pakai: node scripts/build-quiz-bank-id.mjs <IndoMMLU.csv> <out.json> [target=5000]
import fs from 'node:fs';

const csvPath = process.argv[2];
const out = process.argv[3];
const target = Number(process.argv[4] ?? 5000);
if (!csvPath || !out) { console.error('pakai: node build-quiz-bank-id.mjs <csv> <out.json> [target]'); process.exit(1); }

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

const EASY_LEVELS = new Set([
  'SD', 'Kelas I SD', 'Kelas II SD', 'Kelas III SD', 'Kelas IV SD',
  'V SD', 'VI SD', 'SD-SMP', 'SD-SMP-SMA',
  'SMP', 'VII SMP', 'VIII SMP', 'IX SMP',
]);
// jenjang SMA hanya untuk subjek non-teknis (bahasa/ilmu sosial), supaya bank cukup banyak
const SMA_OK_SUBJECTS = new Set(['Bahasa Indonesia', 'IPS', 'PPKN', 'Kesenian', 'Penjaskes', 'Agama Islam', 'Agama Hindu', 'Agama Kristen']);
// subjek berbahasa Indonesia (bahasa daerah/asing sengaja tidak ada di daftar)
const SUBJECTS = new Set([
  'Bahasa Indonesia', 'IPA', 'IPS', 'Agama Islam', 'Kesenian', 'PPKN',
  'Fisika', 'Agama Hindu', 'Agama Kristen', 'Penjaskes', 'Budaya Alam Minangkabau',
]);

const text = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(text);
const header = rows[0].map((h) => h.trim());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const norm = (s) => s.replace(/\s+/g, ' ').trim();
// pembersih artefak scraping yang aman: "mengantar- kan" -> "mengantar-kan", spasi sebelum tanda baca
const clean = (s) => norm(s)
  // "mengantar- kan" = kata terpotong akibat scraping -> sambung ("sosial-ekonomi" tanpa spasi tidak tersentuh)
  .replace(/(\p{L})-\s+(\p{L})/gu, '$1$2')
  .replace(/\s+([,.;:!?])/g, '$1')
  .replace(/\(\s+/g, '(')
  .replace(/\s+\)/g, ')');
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
// aksara non-Latin (Arab, Kiril, CJK, Thai, Devanagari, aksara Jawa/Bali) -> buang
const NON_LATIN = /[\u0600-\u06FF\u0400-\u04FF\u3040-\u30FF\u4E00-\u9FFF\u0E00-\u0E7F\u0900-\u097F\u1B00-\u1B7F]/u;

const seen = new Set();
const questions = [];
let skipped = 0;
const bySubject = {};

for (const r of rows.slice(1)) {
  const level = norm(r[idx.level] ?? '');
  const subject = norm(r[idx.subject] ?? '');
  if (!SUBJECTS.has(subject)) { skipped++; continue; }
  const easy = EASY_LEVELS.has(level) || (level === 'SMA' && SMA_OK_SUBJECTS.has(subject));
  if (!easy) { skipped++; continue; }
  if (norm(r[idx.is_for_fewshot] ?? '0') === '1') { skipped++; continue; }

  const question = clean(r[idx.soal] ?? '');
  if (NON_LATIN.test(question)) { skipped++; continue; }
  if (question.length < 12 || question.length > 300) { skipped++; continue; }

  const lines = String(r[idx.jawaban] ?? '').split('\n').map((l) => l.trim()).filter((l) => /^[A-E]\.\s*/.test(l));
  let opts = lines.map((l) => ({ letter: l[0], text: clean(l.slice(2)) }));
  const correctLetter = String(r[idx.kunci] ?? '').trim().toUpperCase()[0];
  const ci0 = opts.findIndex((o) => o.letter === correctLetter);
  if (opts.length < 3 || ci0 < 0) { skipped++; continue; }
  if (opts.some((o) => NON_LATIN.test(o.text) || !o.text)) { skipped++; continue; }
  const correctOpt = opts[ci0];
  if (opts.length > 4) {
    const wrongIdx = opts.map((_, i) => i).filter((i) => i !== ci0);
    const drop = wrongIdx[Math.floor(Math.random() * wrongIdx.length)];
    opts = opts.filter((_, i) => i !== drop);
  }
  const choices = opts.map((o) => o.text);
  if (question.length > 300 || choices.some((c) => c.length > 100)) { skipped++; continue; }
  if (choices.some((c) => c.length < 1)) { skipped++; continue; }
  // tolak pilihan duplikat
  if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) { skipped++; continue; }
  const key = question.toLowerCase();
  if (seen.has(key)) { skipped++; continue; }
  seen.add(key);
  const correctText = correctOpt.text;
  shuffle(choices);
  questions.push({ question, choices, correctIndex: choices.indexOf(correctText), explanation: '' });
  bySubject[subject] = (bySubject[subject] || 0) + 1;
}

shuffle(questions);
const bank = questions.slice(0, target);

fs.writeFileSync(out, JSON.stringify({
  source: 'IndoMMLU — soal asli Indonesia (indolem/IndoMMLU), subjek berbahasa Indonesia jenjang SD–SMP — huggingface.co/datasets/indolem/IndoMMLU',
  generatedAt: new Date().toISOString(),
  count: bank.length,
  questions: bank,
}, null, 1) + '\n');

console.log(`lolos filter: ${questions.length}, dilewati: ${skipped}, ditulis: ${bank.length}`);
console.log('per subjek:', JSON.stringify(bySubject));
