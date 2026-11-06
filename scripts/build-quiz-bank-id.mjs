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
// Typo yang ditemukan lewat audit KBBI V (scripts/kbbi-check.mjs). Hanya kata Indonesia
// yang jelas salah ketik; kata daerah, nama diri, dan istilah asing sengaja dibiarkan.
const TYPO = {
  alinia: 'alinea', anatara: 'antara', apartride: 'apatride', baiik: 'baik',
  balakang: 'belakang', bayangn: 'bayangan', bebuat: 'berbuat', betujuan: 'bertujuan',
  beumur: 'berumur', beupa: 'berupa', bungga: 'bunga', butsir: 'butir', cahay: 'cahaya',
  cekugan: 'cekungan', cirri: 'ciri', dajam: 'dalam', dalm: 'dalam', dasr: 'dasar',
  dengann: 'dengan', dengang: 'dengan', dtiup: 'ditiup', ekslusif: 'eksklusif',
  factor: 'faktor', falasafah: 'falsafah', gerobag: 'gerobak', hadist: 'hadis',
  hadits: 'hadis', hidrogren: 'hidrogen', hukun: 'hukum', inbuhan: 'imbuhan',
  inividu: 'individu', inpor: 'impor', inport: 'impor', jangung: 'jagung',
  kalmat: 'kalimat', keaadaan: 'keadaan', keamana: 'keamanan', keatuan: 'kesatuan',
  kebenaaran: 'kebenaran', kebituhan: 'kebutuhan', keidupan: 'kehidupan',
  keistimewan: 'keistimewaan', kekerabatn: 'kekerabatan', kematiaan: 'kematian',
  kerajaaan: 'kerajaan', kerjasaa: 'kerjasama', kesejateraan: 'kesejahteraan',
  ketatatnegaraan: 'ketatanegaraan', keterunan: 'keturunan', ketia: 'ketiga',
  keuasaan: 'kekuasaan', kharakteristik: 'karakteristik', komensialisme: 'komensalisme',
  konfflik: 'konflik', konsekkuen: 'konsekuen', konsititusi: 'konstitusi',
  konstitiusi: 'konstitusi', koropsi: 'korupsi', kosumen: 'konsumen', kramik: 'keramik',
  krativitas: 'kreativitas', kuwintal: 'kuintal', kuwitansi: 'kuitansi',
  lingkugan: 'lingkungan', lingkungaa: 'lingkungan', linkungan: 'lingkungan',
  makhlik: 'makhluk', makrometer: 'mikrometer', mandapatkan: 'mendapatkan',
  matrilinial: 'matrilineal', megikuti: 'mengikuti', meiliki: 'memiliki',
  melaksanakaan: 'melaksanakan', membetuk: 'membentuk', memberintahkan: 'memerintahkan',
  memilki: 'memiliki', mempuyai: 'mempunyai', mengankat: 'mengangkat',
  mengelillingi: 'mengelilingi', mengetahuai: 'mengetahui', menghasilka: 'menghasilkan',
  meniggal: 'meninggal', menngunakan: 'menggunakan', menunjuukan: 'menunjukkan',
  menyelessaikan: 'menyelesaikan', menentapkan: 'menetapkan', mewujuddkan: 'mewujudkan',
  miirip: 'mirip', mmemulai: 'memulai', mnggunakan: 'menggunakan', muhammmad: 'muhammad',
  naiak: 'naik', negera: 'negara', nomatif: 'normatif', olahrga: 'olahraga',
  oranf: 'orang', partkel: 'partikel', pemanfaatn: 'pemanfaatan', pemamfaatan: 'pemanfaatan',
  perghormatan: 'penghormatan', permukaaan: 'permukaan', perncanaan: 'perencanaan',
  peryataan: 'pernyataan', piramid: 'piramida', postif: 'positif', praktet: 'praktik',
  prediket: 'predikat', prespitasi: 'presipitasi', prinsif: 'prinsip', pujjian: 'pujian',
  resolus: 'resolusi', rokaat: 'rakaat', salendang: 'selendang', sdikit: 'sedikit',
  sehinga: 'sehingga', sekolag: 'sekolah', seluaruh: 'seluruh', semagat: 'semangat',
  sepert: 'seperti', seranga: 'serangga', seseudah: 'sesudah', sndiri: 'sendiri',
  sosia: 'sosial', strukur: 'struktur', surst: 'surat', sovenir: 'suvenir',
  susasana: 'suasana', tanamana: 'tanaman', tediri: 'terdiri', tegolong: 'tergolong',
  tekhnik: 'teknik', temabaga: 'tembaga', temoat: 'tempat', temometer: 'termometer',
  termometr: 'termometer', termaksuk: 'termasuk', tertinngi: 'tertinggi', tewujud: 'terwujud',
  tidah: 'tidak', tidaka: 'tidak', tingggal: 'tinggal', tntang: 'tentang',
  tradisonal: 'tradisional', tuisan: 'tulisan', ultrasonic: 'ultrasonik', volum: 'volume',
  walapun: 'walaupun', wewenag: 'wewenang', yng: 'yang', alloh: 'allah',
  keberadaanya: 'keberadaan', kecualio: 'kecuali', kembing: 'kambing', balalang: 'belalang',
  // penulisan yang disatukan
  orangtua: 'orang tua', beladiri: 'bela diri', berkembangbiak: 'berkembang biak',
  barangsiapa: 'barang siapa',
};
const TYPO_RE = new RegExp(`\\b(${Object.keys(TYPO).join('|')})\\b`, 'gi');
const fixTypos = (s) => s.replace(TYPO_RE, (m) => TYPO[m.toLowerCase()]);

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

  const question = fixTypos(clean(r[idx.soal] ?? ''));
  if (NON_LATIN.test(question)) { skipped++; continue; }
  if (question.length < 12 || question.length > 300) { skipped++; continue; }

  const lines = String(r[idx.jawaban] ?? '').split('\n').map((l) => l.trim()).filter((l) => /^[A-E]\.\s*/.test(l));
  let opts = lines.map((l) => ({ letter: l[0], text: fixTypos(clean(l.slice(2))) }));
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
