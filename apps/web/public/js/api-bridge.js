/* Bot Caches Dashboard — jembatan ke API platform. Source UI tetap statis; data + aksi dari API. */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let bots = [];
  let bot = null;
  let guildId = '';
  let config = {};
  let channels = [];
  let roles = [];
  let stats = { topCommands: [], commands24h: 0 };
  let errors = [];
  let currentModule = '';

  async function api(path, init = {}) {
    let res;
    try {
      res = await fetch(`/api${path}`, {
        ...init,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });
    } catch (e) {
      throw new Error(`${init.method || 'GET'} ${path}: ${e?.message || 'fetch gagal'}`);
    }
    if (res.status === 401) {
      location.href = '/api/auth/login';
      throw new Error('Belum login');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`${path}: ${body.error || `HTTP ${res.status}`}`);
    }
    return res.json();
  }

  function toast(type, title, message) {
    const box = $('#toastContainer');
    if (!box) return;
    const icons = { success: 'fa-check-circle', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fas ${icons[type] || icons.info} toast-icon"></i><div class="toast-content"><div class="toast-title">${esc(title)}</div><div class="toast-message">${esc(message)}</div></div><button class="toast-close"><i class="fas fa-xmark"></i></button>`;
    box.appendChild(el);
    const close = () => { el.classList.add('removing'); setTimeout(() => el.remove(), 300); };
    el.querySelector('.toast-close').addEventListener('click', close);
    setTimeout(close, 4000);
  }

  const fail = (e) => { if (e?.message !== 'Belum login') toast('error', 'API', e?.message || 'Gagal memuat data'); };
  const guildName = () => bot?.guilds?.find((g) => g.discordGuildId === guildId)?.name || bot?.name || 'server';

  const BANK_KEY = { quiz: 'questions', quotes: 'quotes' };

  const MODULE_SPECS = {
    tickets: {
      label: 'Tiket', desc: 'Kategori, staf, dan transkrip tiket support',
      fields: [
        { key: 'enabled', label: 'Aktifkan tiket', type: 'boolean' },
        { key: 'categoryId', label: 'Kategori tiket', type: 'channel', types: [4] },
        { key: 'staffRoleId', label: 'Role staf', type: 'role' },
        { key: 'transcriptChannelId', label: 'Channel transkrip', type: 'channel' },
        { key: 'maxOpenPerUser', label: 'Maks tiket per user', type: 'number', min: 1, max: 5 },
      ],
    },
    logging: {
      label: 'Logging', desc: 'Catat event server ke channel log',
      fields: [
        { key: 'enabled', label: 'Aktifkan logging', type: 'boolean' },
        { key: 'channelId', label: 'Channel log', type: 'channel' },
        { key: 'logMessageDelete', label: 'Log pesan dihapus', type: 'boolean' },
        { key: 'logMessageEdit', label: 'Log pesan diedit', type: 'boolean' },
        { key: 'logMemberJoin', label: 'Log member join', type: 'boolean' },
        { key: 'logMemberLeave', label: 'Log member leave', type: 'boolean' },
        { key: 'logRoleChange', label: 'Log perubahan role', type: 'boolean' },
      ],
    },
    leveling: {
      label: 'Leveling', desc: 'XP, cooldown, pesan naik level, dan role reward',
      fields: [
        { key: 'enabled', label: 'Aktifkan leveling', type: 'boolean' },
        { key: 'xpMin', label: 'XP minimum per pesan', type: 'number', min: 1, max: 50 },
        { key: 'xpMax', label: 'XP maksimum per pesan', type: 'number', min: 1, max: 50 },
        { key: 'cooldownSec', label: 'Cooldown (detik)', type: 'number', min: 0, max: 600 },
        { key: 'announceChannelId', label: 'Channel pengumuman', type: 'channel' },
        { key: 'levelUpMessage', label: 'Pesan naik level', type: 'text' },
        { key: 'roleRewards', label: 'Role reward (JSON)', type: 'json', wide: true },
      ],
    },
    economy: {
      label: 'Ekonomi', desc: 'Mata uang, daily, kerja, dan toko',
      fields: [
        { key: 'enabled', label: 'Aktifkan ekonomi', type: 'boolean' },
        { key: 'currencyName', label: 'Nama mata uang', type: 'text' },
        { key: 'dailyAmount', label: 'Jumlah daily', type: 'number', min: 1, max: 100000 },
        { key: 'workMin', label: 'Kerja minimum', type: 'number', min: 1, max: 10000 },
        { key: 'workMax', label: 'Kerja maksimum', type: 'number', min: 1, max: 10000 },
        { key: 'workCooldownSec', label: 'Cooldown kerja (detik)', type: 'number', min: 60, max: 86400 },
        { key: 'shop', label: 'Toko (JSON)', type: 'json', wide: true },
      ],
    },
    quiz: {
      label: 'Quiz', desc: 'Pengaturan sesi quiz dan bank soal',
      fields: [
        { key: 'enabled', label: 'Aktifkan quiz', type: 'boolean' },
        { key: 'title', label: 'Judul quiz', type: 'text' },
        { key: 'pointsName', label: 'Nama poin', type: 'text' },
        { key: 'timePerQuestionSec', label: 'Waktu per soal (detik)', type: 'number', min: 5, max: 600 },
        { key: 'pointsPerQuestion', label: 'Poin per soal', type: 'number', min: 10, max: 1000 },
        { key: 'questionsPerSession', label: 'Soal per sesi', type: 'number', min: 1, max: 50 },
        { key: 'mentionRoleId', label: 'Role yang di-ping', type: 'role' },
        { key: 'questions', label: 'Bank soal', type: 'bank' },
      ],
    },
    quotes: {
      label: 'Kutipan', desc: 'Kartu kutipan, jadwal harian, dan bank kutipan',
      fields: [
        { key: 'enabled', label: 'Aktifkan kutipan', type: 'boolean' },
        { key: 'channelId', label: 'Channel kutipan', type: 'channel' },
        { key: 'daily', label: 'Kirim otomatis tiap hari', type: 'boolean' },
        { key: 'scheduleHour', label: 'Jam kirim (WIB)', type: 'number', min: 0, max: 23 },
        { key: 'watermark', label: 'Watermark', type: 'text' },
        { key: 'font', label: 'Font', type: 'select', options: [['poppins', 'Poppins'], ['playfair', 'Playfair Display']] },
        { key: 'textSize', label: 'Ukuran teks', type: 'select', options: [['kecil', 'Kecil'], ['sedang', 'Sedang'], ['besar', 'Besar']] },
        { key: 'photoPosition', label: 'Posisi foto', type: 'select', options: [['kiri', 'Kiri'], ['kanan', 'Kanan']] },
        { key: 'quotes', label: 'Bank kutipan', type: 'bank' },
      ],
    },
    wizzy: {
      label: 'Wizzy', desc: 'Ekonomi, hunt, dan pengaturan game Wizzy',
      fields: [
        { key: 'enabled', label: 'Aktifkan Wizzy', type: 'boolean' },
        { key: 'currency', label: 'Nama mata uang', type: 'text' },
        { key: 'huntCooldownSec', label: 'Cooldown hunt (detik)', type: 'number', min: 1, max: 3600 },
        { key: 'maxLevel', label: 'Level maksimum', type: 'number', min: 2, max: 200 },
        { key: 'startingSlots', label: 'Slot awal', type: 'number', min: 1, max: 5 },
        { key: 'maxSlots', label: 'Slot maksimum', type: 'number', min: 1, max: 10 },
        { key: 'giveTaxPct', label: 'Pajak give (%)', type: 'number', min: 0, max: 50 },
        { key: 'maxBet', label: 'Taruhan maksimum', type: 'number', min: 1, max: 1000000 },
        { key: 'fuseCost', label: 'Biaya fuse', type: 'number', min: 0, max: 1000000 },
        { key: 'autohuntCost', label: 'Biaya autohunt', type: 'number', min: 0, max: 1000000 },
        { key: 'autohuntMax', label: 'Autohunt maksimum', type: 'number', min: 1, max: 100 },
        { key: 'covenCost', label: 'Biaya coven', type: 'number', min: 0, max: 1000000 },
        { key: 'covenMax', label: 'Anggota coven maksimum', type: 'number', min: 1, max: 200 },
      ],
    },
    customcmd: {
      label: 'Custom Command', desc: 'Command buatan sendiri untuk server',
      fields: [
        { key: 'enabled', label: 'Aktifkan custom command', type: 'boolean' },
        { key: 'commands', label: 'Daftar command (JSON)', type: 'json', wide: true },
      ],
    },
  };

  function configValue(name, key) {
    return (config[name] ?? {})[key];
  }

  function optionList(items, selected, emptyLabel) {
    return (emptyLabel ? `<option value="">${emptyLabel}</option>` : '') + items.map(([value, label]) =>
      `<option value="${esc(value)}" ${String(selected ?? '') === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function fieldHTML(name, f) {
    const value = configValue(name, f.key);
    const wide = f.wide || f.type === 'json' || f.type === 'bank' ? ' config-wide' : '';
    const id = `cfg-${name}-${f.key}`;
    const label = `<label for="${id}">${esc(f.label)}</label>`;

    if (f.type === 'boolean') return `<div class="config-field${wide}"><label>${esc(f.label)}</label><label class="toggle"><input type="checkbox" data-cfg="${f.key}" ${value ? 'checked' : ''}><span class="toggle-slider"></span></label></div>`;
    if (f.type === 'channel') {
      const types = f.types ?? [0, 5];
      const opts = channels.filter((c) => types.includes(c.type)).map((c) => [c.id, `${c.type === 4 ? '📁 ' : '#'}${c.name}`]);
      return `<div class="config-field${wide}">${label}<select class="select-input" id="${id}" data-cfg="${f.key}">${optionList(opts, value, '— tidak diset —')}</select></div>`;
    }
    if (f.type === 'role') {
      const opts = roles.map((r) => [r.id, `@${r.name}`]);
      return `<div class="config-field${wide}">${label}<select class="select-input" id="${id}" data-cfg="${f.key}">${optionList(opts, value, '— tidak diset —')}</select></div>`;
    }
    if (f.type === 'select') {
      return `<div class="config-field${wide}">${label}<select class="select-input" id="${id}" data-cfg="${f.key}">${optionList(f.options, value)}</select></div>`;
    }
    if (f.type === 'number') {
      return `<div class="config-field${wide}">${label}<input type="number" class="text-input" id="${id}" data-cfg="${f.key}" value="${esc(value ?? '')}" min="${f.min ?? ''}" max="${f.max ?? ''}"></div>`;
    }
    if (f.type === 'json') {
      return `<div class="config-field${wide}">${label}<textarea class="textarea-input" id="${id}" data-cfg="${f.key}" rows="5">${esc(JSON.stringify(value ?? [], null, 2))}</textarea></div>`;
    }
    if (f.type === 'bank') {
      const module = name;
      return `<div class="config-field${wide}">${label}<p class="config-note">Dimuat terpisah agar dashboard tetap ringan.</p><div class="input-group"><button class="btn btn-ghost" type="button" data-bank-load="${module}"><i class="fas fa-download"></i> Muat Bank</button><button class="btn btn-primary" type="button" data-bank-save="${module}"><i class="fas fa-upload"></i> Simpan Bank</button></div><textarea class="textarea-input" data-bank="${module}" rows="8" placeholder="Klik Muat Bank untuk melihat isi."></textarea></div>`;
    }
    return `<div class="config-field${wide}">${label}<input type="text" class="text-input" id="${id}" data-cfg="${f.key}" value="${esc(value ?? '')}"></div>`;
  }

  function renderConfig() {
    const form = $('#configForm');
    if (!form) return;
    const title = $('#configTitle');
    const subtitle = $('#configSubtitle');
    const spec = MODULE_SPECS[currentModule];

    if (!spec) {
      if (title) title.textContent = 'Konfigurasi';
      if (subtitle) subtitle.textContent = 'Pilih modul di sidebar untuk mulai mengatur.';
      form.innerHTML = '<p class="config-note">Pilih modul di sidebar.</p>';
      return;
    }
    if (title) title.textContent = spec.label;
    if (subtitle) subtitle.textContent = `${spec.desc} • ${guildName()}`;
    if (!bot || !guildId) {
      form.innerHTML = '<p class="config-note">Pilih bot dan server terlebih dahulu.</p>';
      return;
    }
    form.innerHTML = spec.fields.map((f) => fieldHTML(currentModule, f)).join('');
    $$('[data-bank-load]', form).forEach((btn) => btn.addEventListener('click', () => void loadBank(btn.dataset.bankLoad)));
    $$('[data-bank-save]', form).forEach((btn) => btn.addEventListener('click', () => void saveBank(btn.dataset.bankSave)));
  }

  function selectConfigModule(name) {
    currentModule = MODULE_SPECS[name] ? name : '';
    $$('.nav-item[data-page="config"]').forEach((item) => {
      item.classList.toggle('active', item.dataset.module === currentModule);
    });
    renderConfig();
  }

  async function loadBank(name) {
    if (!bot || !guildId) return;
    try {
      const res = await api(`/bots/${bot.id}/guilds/${guildId}/config/${name}`);
      const bank = res.config?.[BANK_KEY[name]] ?? [];
      const ta = $(`[data-bank="${name}"]`);
      if (ta) ta.value = JSON.stringify(bank, null, 2);
      toast('info', 'Bank dimuat', `${bank.length} item`);
    } catch (e) { fail(e); }
  }

  async function saveBank(name) {
    if (!bot || !guildId) return;
    const ta = $(`[data-bank="${name}"]`);
    let bank;
    try { bank = JSON.parse(ta?.value || '[]'); }
    catch { return toast('error', 'JSON tidak valid', 'Periksa format bank sebelum menyimpan.'); }
    try {
      await api(`/bots/${bot.id}/guilds/${guildId}/config/${name}`, {
        method: 'PUT',
        body: JSON.stringify({ ...(config[name] ?? {}), [BANK_KEY[name]]: bank }),
      });
      toast('success', 'Tersimpan', `Bank ${MODULE_SPECS[name]?.label || name} diperbarui`);
      await loadDetail();
    } catch (e) { fail(e); }
  }

  async function saveConfigModule() {
    if (!currentModule) return toast('warning', 'Konfigurasi', 'Pilih modul di sidebar terlebih dahulu.');
    const spec = MODULE_SPECS[currentModule];
    const patch = {};
    for (const f of spec.fields) {
      if (f.type === 'bank') continue;
      const el = $(`[data-cfg="${f.key}"]`);
      if (!el) continue;
      if (f.type === 'boolean') patch[f.key] = el.checked;
      else if (f.type === 'number') { if (el.value !== '') patch[f.key] = Number(el.value); }
      else if (f.type === 'json') {
        try { patch[f.key] = JSON.parse(el.value || '[]'); }
        catch { return toast('error', 'JSON tidak valid', `Periksa field "${f.label}".`); }
      } else patch[f.key] = el.value.trim();
    }
    try {
      const merged = { ...(config[currentModule] ?? {}), ...patch };
      // Modul dengan bank: ambil bank utuh dulu supaya questions/quotes tidak terhapus.
      if (BANK_KEY[currentModule]) {
        const full = await api(`/bots/${bot.id}/guilds/${guildId}/config/${currentModule}`);
        Object.assign(merged, full.config, patch);
      }
      await api(`/bots/${bot.id}/guilds/${guildId}/config/${currentModule}`, {
        method: 'PUT', body: JSON.stringify(merged),
      });
      config[currentModule] = merged;
      toast('success', 'Tersimpan', `${spec.label} diperbarui`);
    } catch (e) { fail(e); }
  }

  function renderServers() {
    const list = $('.server-list');
    if (!list) return;
    const items = bots.flatMap((b) => b.guilds?.length
      ? b.guilds.map((g) => ({ b, g, label: g.name, sub: b.name }))
      : [{ b, g: null, label: b.name, sub: 'belum ada server' }]);
    list.innerHTML = items.length ? items.map(({ b, g, label, sub }) => `
      <div class="server-item ${b.id === bot?.id && (g?.discordGuildId || '') === guildId ? 'active' : ''}"
           data-bot="${b.id}" data-guild="${esc(g?.discordGuildId || '')}">
        <div class="server-avatar" style="background:linear-gradient(135deg,#5865F2,#7289DA)">${esc(label[0]?.toUpperCase() || 'B')}</div>
        <div class="server-info">
          <span class="server-name">${esc(label)}</span>
          <span class="server-members">${esc(sub)}</span>
        </div>
        <i class="fas fa-check"></i>
      </div>`).join('') : '<div class="server-item"><div class="server-info"><span class="server-name">Belum ada bot untuk akun ini</span></div></div>';

    $$('.server-item[data-bot]', list).forEach((el) => el.addEventListener('click', async () => {
      const id = Number(el.dataset.bot);
      const gid = el.dataset.guild;
      if (id === bot?.id && gid === guildId) return;
      bot = bots.find((b) => b.id === id) || null;
      guildId = gid;
      localStorage.setItem('botcaches.selection', JSON.stringify({ botId: id, guildId: gid }));
      renderCurrent();
      await loadDetail();
    }));
  }

  function renderCurrent() {
    if (!bot) return;
    const cur = $('#serverCurrent');
    const label = guildName();
    if (cur) {
      $('.server-name', cur).textContent = label;
      $('.server-members', cur).innerHTML = `<i class="fas fa-users"></i> ${bot.guilds?.length ?? 0} server`;
      $('.server-avatar', cur).textContent = label[0]?.toUpperCase() || 'B';
    }
    const previewName = $('.discord-bot-name');
    if (previewName) previewName.textContent = bot.name;
    const status = $('.bot-status .status-text');
    if (status) status.textContent = `${bot.runtimeStatus === 'online' ? 'Online' : 'Offline'} — prefix ${bot.prefix}`;
    $('.bot-status .status-dot')?.classList.toggle('online', bot.runtimeStatus === 'online');
    $('.bot-status .status-dot')?.classList.toggle('offline', bot.runtimeStatus !== 'online');
  }

  function renderStats() {
    const cards = $$('.stat-card');
    const values = [
      ['Server Terhubung', bot?.guilds?.length ?? 0, `prefix ${bot?.prefix ?? '-'}`],
      ['Perintah 24 Jam', stats.commands24h, 'dari commandLogs'],
      ['Modul Aktif', bot?.modules.length ?? 0, (bot?.modules || []).slice(0, 4).join(', ') || 'tidak ada'],
      ['Status Bot', bot?.runtimeStatus === 'online' ? 'Online' : 'Offline', bot?.status || '-'],
    ];
    cards.forEach((card, i) => {
      const v = values[i];
      if (!v) return;
      const label = $('.stat-label', card); const value = $('.stat-value', card); const change = $('.stat-change', card);
      if (label) label.textContent = v[0];
      if (value) { value.textContent = v[1]; delete value.dataset.target; }
      if (change) change.textContent = v[2];
    });
    $('#page-dashboard .welcome-content h2').textContent = `Halo, ${$('.user-name')?.textContent || 'Admin'}! 👋`;
    $('#page-dashboard .welcome-content p').innerHTML = `Bot <strong>${esc(bot?.name || '-')}</strong> terhubung ke <strong>${esc(bot?.guilds?.length ?? 0)}</strong> server.`;
  }

  function renderChart() {
    const canvas = $('#activityChart');
    if (!canvas || typeof Chart === 'undefined') return;
    window.activityChart?.destroy?.();
    const rows = stats.topCommands || [];
    window.activityChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.length ? rows.map((r) => `/${r.name}`) : ['Belum ada data'],
        datasets: [{ label: 'Perintah 30 hari', data: rows.length ? rows.map((r) => r.count) : [0], backgroundColor: '#5865F2', borderRadius: 6 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8B8D94' } }, y: { beginAtZero: true, ticks: { color: '#8B8D94' } } } },
    });
  }

  function renderActivity() {
    const box = $('.activity-timeline');
    if (!box) return;
    box.innerHTML = errors.length ? errors.map((e) => `
      <div class="timeline-item">
        <div class="timeline-dot red"></div>
        <div class="timeline-content">
          <div class="timeline-header"><span class="timeline-user">Error bot</span><span class="timeline-time">${esc(new Date(e.createdAt).toLocaleString('id-ID'))}</span></div>
          <p>${esc(e.message)}</p>
        </div>
      </div>`).join('') : '<div class="timeline-item"><div class="timeline-dot green"></div><div class="timeline-content"><div class="timeline-header"><span class="timeline-user">Tidak ada error</span></div><p>Belum ada error tercatat untuk bot ini.</p></div></div>';
  }

  function renderTopCommands() {
    const card = $('.members-card');
    if (!card) return;
    $('.card-title h3', card).textContent = 'Perintah Teratas';
    $('.card-title p', card).textContent = '30 hari terakhir';
    $('.leaderboard', card).innerHTML = (stats.topCommands || []).map((c, i) => `
      <div class="lb-item rank-${i + 1}">
        <span class="lb-rank ${i > 2 ? 'silver' : ''}">${i === 0 ? '<i class="fas fa-crown"></i>' : i + 1}</span>
        <div class="lb-info"><span class="lb-name">/${esc(c.name)}</span></div>
        <div class="lb-stats"><span class="lb-xp">${c.count}x</span></div>
      </div>`).join('') || '<div class="lb-item"><div class="lb-info"><span class="lb-name">Belum ada data perintah</span></div></div>';
  }

  function updateForms() {
    if ($('#botNameInput')) $('#botNameInput').value = bot?.name || '';
    if ($('#botPrefixInput')) $('#botPrefixInput').value = bot?.prefix || '';

    const firstCard = $$('.automod-card')[0];
    if (firstCard) {
      const toggle = $('input[type=checkbox]', firstCard);
      if (toggle) toggle.checked = !!config.moderation?.enabled;
      const select = $('#modLogChannel');
      if (select) select.value = config.moderation?.modLogChannelId || '';
    }

    const welcomeCard = $('.welcome-editor-card');
    if (welcomeCard) {
      const select = $('.form-group select', welcomeCard);
      const textarea = $('textarea.textarea-input', welcomeCard);
      if (select) select.value = config.welcome?.channelId || '';
      if (textarea) {
        textarea.value = config.welcome?.message || 'Selamat datang {user} di {server}!';
        const preview = $('.discord-preview .embed-desc');
        if (preview) preview.textContent = textarea.value.replace('{user}', '@member').replace('{server}', guildName());
      }
    }
  }

  async function patchBot(body) {
    if (!bot) return;
    try {
      await api(`/bots/${bot.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast('success', 'Tersimpan', 'Bot diperbarui');
      await loadDetail();
    } catch (e) { fail(e); }
  }

  async function saveConfig(body) {
    if (!bot || !guildId) return toast('warning', 'Bot', 'Pilih server terlebih dahulu');
    try {
      await api(`/bots/${bot.id}/guilds/${guildId}/config`, { method: 'PUT', body: JSON.stringify(body) });
      toast('success', 'Tersimpan', 'Konfigurasi server diperbarui');
      await loadDetail();
    } catch (e) { fail(e); }
  }

  function wireCommands() {
    const map = { ban: 'moderation', kick: 'moderation', mute: 'moderation', purge: 'moderation', meme: 'utilities', '8ball': 'utilities', trivia: 'quiz', userinfo: 'utilities', serverinfo: 'utilities' };
    $$('.command-card').forEach((card) => {
      const name = ($('.cmd-name', card)?.textContent || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const mod = map[name];
      const input = $('input[type=checkbox]', card);
      if (!mod || !input || card.dataset.wired) return;
      card.dataset.wired = '1';
      card.dataset.module = mod;
      input.checked = !!bot?.modules.includes(mod);
      input.addEventListener('change', () => {
        const next = new Set(bot?.modules || []);
        input.checked ? next.add(mod) : next.delete(mod);
        void patchBot({ modules: [...next] });
      });
    });
  }

  function wireAutomod() {
    const card = $$('.automod-card')[0];
    if (!card) return;
    const toggle = $('input[type=checkbox]', card);
    toggle?.addEventListener('change', () => saveConfig({
      moderation: { ...{ enabled: true, moderatorRoleId: '', modLogChannelId: '' }, ...(config.moderation || {}), enabled: toggle.checked },
    }));

    const body = $('.automod-body', card);
    if (!$('#modLogChannel') && body) {
      const wrap = document.createElement('div');
      wrap.className = 'automod-setting';
      wrap.innerHTML = '<label>Channel Log Moderasi</label><select class="select-input" id="modLogChannel"><option value="">Nonaktif</option></select>';
      body.appendChild(wrap);
    }
    const select = $('#modLogChannel');
    select?.addEventListener('change', () => saveConfig({
      moderation: { ...{ enabled: true, moderatorRoleId: '', modLogChannelId: '' }, ...(config.moderation || {}), modLogChannelId: select.value },
    }));
  }

  function wireWelcome() {
    const card = $('.welcome-editor-card');
    if (!card) return;
    const select = $('.form-group select', card);
    const textarea = $('textarea.textarea-input', card);
    const save = $('.form-actions .btn-primary', card);
    select?.addEventListener('change', () => {
      const preview = $('.discord-preview .embed-desc');
      if (preview) preview.textContent = textarea?.value.replace('{user}', '@member').replace('{server}', guildName()) || '';
    });
    textarea?.addEventListener('input', () => {
      const preview = $('.discord-preview .embed-desc');
      if (preview) preview.textContent = textarea.value.replace('{user}', '@member').replace('{server}', guildName());
    });
    save?.addEventListener('click', () => saveConfig({
      welcome: {
        ...{ enabled: true, channelId: '', message: 'Selamat datang {user} di {server}!', dmEnabled: false, dmMessage: 'Halo {user}, selamat datang di {server}!', autoRoleId: '' },
        ...(config.welcome || {}),
        channelId: select?.value || '',
        message: textarea?.value || 'Selamat datang {user} di {server}!',
      },
    }));
    $('.form-actions .btn-ghost', card)?.addEventListener('click', () => {
      if (textarea) textarea.value = 'Selamat datang {user} di {server}!';
      textarea?.dispatchEvent(new Event('input'));
    });
  }

  function wireSettings() {
    $('.settings-content .btn-primary')?.addEventListener('click', () => patchBot({
      name: $('#botNameInput')?.value.trim() || bot?.name,
      prefix: $('#botPrefixInput')?.value.trim() || bot?.prefix,
    }));
  }

  function wireQuickActions() {
    const restart = $('.quick-action[data-action="restart"]');
    if (!restart) return;
    const clone = restart.cloneNode(true);
    restart.replaceWith(clone);
    clone.addEventListener('click', () => {
      if (!confirm(`Restart bot ${bot?.name || ''}?`)) return;
      void patchBot({ status: bot?.status || 'running' });
    });
  }

  function wireLogout() {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.style.cssText = 'margin:8px 16px;width:calc(100% - 32px);justify-content:center';
    btn.innerHTML = '<i class="fas fa-right-from-bracket"></i> Keluar';
    btn.addEventListener('click', async () => {
      try { await api('/auth/logout', { method: 'POST' }); } catch (e) { fail(e); }
      location.href = '/api/auth/login';
    });
    $('.sidebar-footer')?.appendChild(btn);
  }

  async function loadDetail() {
    if (!bot) return;
    guildId = guildId || bot.guilds?.[0]?.discordGuildId || '';
    if (!guildId) {
      config = {}; channels = []; roles = []; stats = { topCommands: [], commands24h: 0 }; errors = [];
      toast('warning', 'Bot', 'Bot belum tergabung di server mana pun');
      renderAll();
      return;
    }
    try {
      const [detail, cfg, ch, rl, st, err] = await Promise.all([
        api(`/bots/${bot.id}`),
        api(`/bots/${bot.id}/guilds/${guildId}/config`),
        api(`/bots/${bot.id}/guilds/${guildId}/channels`),
        api(`/bots/${bot.id}/guilds/${guildId}/roles`).catch(() => ({ roles: [] })),
        api(`/bots/${bot.id}/stats`),
        api(`/bots/${bot.id}/errors?limit=20`),
      ]);
      bot = detail.bot;
      config = cfg.config;
      channels = ch.channels;
      roles = rl.roles;
      stats = st;
      errors = err.errors;
      renderAll();
    } catch (e) { fail(e); }
  }

  function applyBotScope() {
    const mods = new Set(bot?.modules ?? []);
    const allowed = (m) => !m || mods.has(m);
    const requirement = (el) => el.dataset.requires || (el.dataset.page === 'config' ? el.dataset.module : '');
    $$('.nav-item[data-page], .cmd-palette-item').forEach((el) => {
      el.classList.toggle('scope-hidden', !allowed(requirement(el)));
    });
    $$('.nav-section').forEach((sec) => {
      const items = $$('.nav-item', sec);
      sec.classList.toggle('scope-hidden', items.length > 0 && items.every((el) => el.classList.contains('scope-hidden')));
    });

    const onConfig = $('#page-config')?.classList.contains('active');
    if (currentModule && !mods.has(currentModule)) {
      selectConfigModule('');
      if (onConfig) $('.nav-item[data-page="dashboard"]')?.click();
    }

    const active = $('.page.active');
    const page = active?.id.replace(/^page-/, '');
    if (page && page !== 'config') {
      const nav = $(`.nav-item[data-page="${page}"]`);
      if (nav?.classList.contains('scope-hidden')) $('.nav-item[data-page="dashboard"]')?.click();
    }
  }

  function renderAll() {
    applyBotScope();
    renderCurrent();
    renderStats();
    renderChart();
    renderActivity();
    renderTopCommands();
    const select = $('#modLogChannel');
    if (select) {
      select.innerHTML = '<option value="">Nonaktif</option>' + channels.map((c) => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('');
    }
    const welcomeSelect = $('.welcome-editor-card .form-group select');
    if (welcomeSelect) {
      welcomeSelect.innerHTML = '<option value="">Pilih channel</option>' + channels.filter((c) => c.type === 0 || c.type === 5).map((c) => `<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('');
    }
    updateForms();
    wireCommands();
    renderConfig();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    wireAutomod();
    wireWelcome();
    wireSettings();
    wireQuickActions();
    wireLogout();
    $$('.nav-item[data-module]').forEach((item) => item.addEventListener('click', () => selectConfigModule(item.dataset.module)));
    $('#configSave')?.addEventListener('click', () => void saveConfigModule());
    try {
      const me = await api('/auth/me');
      const u = me.user;
      const name = $('.user-name');
      if (name) name.textContent = u.username;
      const role = $('.user-role');
      if (role) role.textContent = `ID: ${u.discordId}`;
      const avatar = $('.user-avatar');
      if (avatar && u.avatar) avatar.src = `https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=64`;
      const data = await api('/bots');
      bots = await Promise.all(data.bots.map(async (b) => {
        try { return (await api(`/bots/${b.id}`)).bot; }
        catch { return { ...b, guilds: [] }; }
      }));
      if (!bots.length) toast('warning', 'Belum ada bot', `Akun ${u.discordId} bukan owner/manager bot. Login dengan akun pemilik bot.`);
      const saved = JSON.parse(localStorage.getItem('botcaches.selection') || '{}');
      bot = bots.find((b) => b.id === saved.botId) || bots[0] || null;
      guildId = saved.guildId || bot?.guilds?.[0]?.discordGuildId || '';
      renderServers();
      await loadDetail();
    } catch (e) { fail(e); }
  });
})();
