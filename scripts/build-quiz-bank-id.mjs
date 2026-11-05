// Konversi openai/MMMLU (terjemahan Indonesia profesional, MIT) -> deploy/quiz-bank.json
// Pakai: node scripts/build-quiz-bank-id.mjs <mmmlu_ID-ID.csv> <output.json> [target=5000]
import fs from 'node:fs';

const csvPath = process.argv[2];
const out = process.argv[3];
const target = Number(process.argv[4] ?? 5000);
if (!csvPath || !out) { console.error('pakai: node build-quiz-bank-id.mjs <csv> <out.json> [target]'); process.exit(1); }

// --- parser CSV RFC4180 mini (field ber-quote, quote digandakan) ---
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// subjek pengetahuan umum yang pantas buat kuis santai — sisanya (matematika,
// logika formal, hukum US, moral_scenarios, kedokteran berat) dibuang
const SUBJECTS = new Set([
  'miscellaneous', 'prehistory', 'nutrition', 'high_school_biology',
  'high_school_world_history', 'high_school_geography', 'world_religions',
  'astronomy', 'global_facts', 'high_school_european_history',
  'conceptual_physics', 'sociology', 'high_school_psychology',
  'logical_fallacies', 'human_aging', 'marketing', 'high_school_chemistry',
  'high_school_us_history', 'clinical_knowledge', 'virology',
  'high_school_physics', 'college_biology', 'human_sexuality',
  'public_relations', 'management', 'business_ethics',
  'elementary_mathematics', 'high_school_macroeconomics', 'high_school_microeconomics',
]);

const text = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(text);
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

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

for (const r of rows.slice(1)) {
  const subject = norm(r[idx.Subject] ?? '').toLowerCase();
  if (!SUBJECTS.has(subject)) { skipped++; continue; }
  const question = norm(r[idx.Question] ?? '');
  const choices = ['A', 'B', 'C', 'D'].map((k) => norm(r[idx[k]] ?? ''));
  const answer = norm(r[idx.Answer] ?? '').toUpperCase(); // A-D
  if (!question || choices.some((c) => !c) || !'ABCD'.includes(answer)) { skipped++; continue; }
  if (question.length > 300 || choices.some((c) => c.length > 100)) { skipped++; continue; }
  if (new Set(choices.map((c) => c.toLowerCase())).size !== 4) { skipped++; continue; }
  const key = question.toLowerCase();
  if (seen.has(key)) { skipped++; continue; }
  seen.add(key);
  const correctText = choices[answer.charCodeAt(0) - 65];
  shuffle(choices);
  questions.push({ question, choices, correctIndex: choices.indexOf(correctText), explanation: '' });
}

shuffle(questions);
const bank = questions.slice(0, target);

fs.writeFileSync(out, JSON.stringify({
  source: 'openai/MMMLU test/mmlu_ID-ID.csv — terjemahan Indonesia profesional (lisensi MIT) — huggingface.co/datasets/openai/MMMLU',
  generatedAt: new Date().toISOString(),
  count: bank.length,
  questions: bank,
}, null, 1) + '\n');

console.log(`baris: ${rows.length - 1}, lolos filter: ${questions.length}, dilewati: ${skipped}, ditulis: ${bank.length}`);
