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
  let stats = { topCommands: [], commands24h: 0 };
  let errors = [];

  async function api(path, init = {}) {
    const res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    if (res.status === 401) {
      location.href = '/api/auth/login';
      throw new Error('Belum login');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
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
  const guildName = () => bot?.guilds.find((g) => g.discordGuildId === guildId)?.name || bot?.name || 'server';

  function renderServers() {
    const list = $('.server-list');
    if (!list) return;
    const items = bots.flatMap((b) => b.guilds.length
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
      </div>`).join('') : '<div class="server-item"><div class="server-info"><span class="server-name">Belum ada bot</span></div></div>';

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
      $('.server-members', cur).innerHTML = `<i class="fas fa-users"></i> ${bot.guilds.length} server`;
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
      ['Server Terhubung', bot?.guilds.length ?? 0, `prefix ${bot?.prefix ?? '-'}`],
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
    $('#page-dashboard .welcome-content p').innerHTML = `Bot <strong>${esc(bot?.name || '-')}</strong> terhubung ke <strong>${esc(bot?.guilds.length ?? 0)}</strong> server.`;
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
    guildId = guildId || bot.guilds[0]?.discordGuildId || '';
    if (!guildId) {
      config = {}; channels = []; stats = { topCommands: [], commands24h: 0 }; errors = [];
      toast('warning', 'Bot', 'Bot belum tergabung di server mana pun');
      renderAll();
      return;
    }
    try {
      const [detail, cfg, ch, st, err] = await Promise.all([
        api(`/bots/${bot.id}`),
        api(`/bots/${bot.id}/guilds/${guildId}/config`),
        api(`/bots/${bot.id}/guilds/${guildId}/channels`),
        api(`/bots/${bot.id}/stats`),
        api(`/bots/${bot.id}/errors?limit=20`),
      ]);
      bot = detail.bot;
      config = cfg.config;
      channels = ch.channels;
      stats = st;
      errors = err.errors;
      renderAll();
    } catch (e) { fail(e); }
  }

  function renderAll() {
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
  }

  document.addEventListener('DOMContentLoaded', async () => {
    wireAutomod();
    wireWelcome();
    wireSettings();
    wireQuickActions();
    wireLogout();
    try {
      const me = await api('/auth/me');
      const u = me.user;
      const name = $('.user-name');
      if (name) name.textContent = u.username;
      const avatar = $('.user-avatar');
      if (avatar && u.avatar) avatar.src = `https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=64`;
      const data = await api('/bots');
      bots = data.bots;
      const saved = JSON.parse(localStorage.getItem('botcaches.selection') || '{}');
      bot = bots.find((b) => b.id === saved.botId) || bots[0] || null;
      guildId = saved.guildId || bot?.guilds[0]?.discordGuildId || '';
      renderServers();
      await loadDetail();
    } catch (e) { fail(e); }
  });
})();
