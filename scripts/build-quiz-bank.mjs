// Konversi OpenTriviaQA (CC BY-SA 4.0) -> deploy/quiz-bank.json
// Pakai: node scripts/build-quiz-bank.mjs <dir-OpenTriviaQA> <output.json> [target=5000]
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const out = process.argv[3];
const target = Number(process.argv[4] ?? 5000);
if (!root || !out) { console.error('pakai: node build-quiz-bank.mjs <dir-OpenTriviaQA> <out.json> [target]'); process.exit(1); }

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})(path.join(root, 'categories'));

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function parseFile(txt) {
  const lines = txt.split(/\r?\n/);
  const qs = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith('#Q')) {
      if (cur) qs.push(cur);
      cur = { q: line.slice(2).trim(), correct: '', choices: [] };
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('^')) cur.correct = line.slice(1).trim();
    else if (/^[A-D] /.test(line)) cur.choices.push(line.slice(2).trim());
    else if (line.trim() && cur.choices.length === 0 && !cur.correct) cur.q += ' ' + line.trim();
  }
  if (cur) qs.push(cur);
  return qs;
}

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

for (const f of files) {
  let parsed;
  try { parsed = parseFile(fs.readFileSync(f, 'utf8')); } catch { continue; }
  for (const item of parsed) {
    const question = norm(item.q);
    const choices = item.choices.map(norm).filter(Boolean).slice(0, 4);
    const correct = norm(item.correct);
    if (!question || !correct || choices.length < 2) { skipped++; continue; }
    if (question.length > 300 || choices.some((c) => c.length > 100)) { skipped++; continue; }
    // wajib tepat 4 pilihan — soal 2 pilihan terasa murahan di Discord
    if (choices.length !== 4) { skipped++; continue; }
    // tolak pilihan duplikat — skema runtime menolak seluruh bank jika ada satu saja
    if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) { skipped++; continue; }
    const ci = choices.findIndex((c) => c.toLowerCase() === correct.toLowerCase());
    if (ci < 0) { skipped++; continue; }
    // acak posisi pilihan agar jawaban benar tidak selalu di posisi yang sama
    const correctText = choices[ci];
    shuffle(choices);
    const correctIndex = choices.indexOf(correctText);
    const key = `${question.toLowerCase()}|${choices.join('|').toLowerCase()}`;
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    questions.push({ question, choices, correctIndex, explanation: '' });
  }
}

shuffle(questions);
const bank = questions.slice(0, target);

fs.writeFileSync(out, JSON.stringify({
  source: 'OpenTriviaQA — github.com/uberspot/OpenTriviaQA (CC BY-SA 4.0)',
  generatedAt: new Date().toISOString(),
  count: bank.length,
  questions: bank,
}, null, 1) + '\n');

console.log(`file dipindai: ${files.length}, soal valid: ${questions.length}, dilewati: ${skipped}, ditulis: ${bank.length}`);
