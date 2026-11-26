/* ══════════════════════════════════════════════════════════════
   Bot Caches Dashboard — Application Logic
   ══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // ── Element References ────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const themeToggle = document.getElementById('themeToggle');
  const notifBtn = document.getElementById('notifBtn');
  const notifPanel = document.getElementById('notifPanel');
  const notifClear = document.getElementById('notifClear');
  const serverCurrent = document.getElementById('serverCurrent');
  const serverDropdown = document.getElementById('serverDropdown');
  const cmdPalette = document.getElementById('cmdPalette');
  const cmdPaletteInput = document.getElementById('cmdPaletteInput');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose = document.getElementById('modalClose');
  const breadcrumbText = document.getElementById('breadcrumbText');
  const toastContainer = document.getElementById('toastContainer');

  // ══════════════════════════════════════════════════════
  // SIDEBAR
  // ══════════════════════════════════════════════════════
  sidebarToggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
  });

  // Restore sidebar state
  if (localStorage.getItem('sidebar-collapsed') === 'true') {
    sidebar.classList.add('collapsed');
  }

  // Mobile menu
  mobileMenuBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });

  // Close mobile sidebar on outside click
  document.addEventListener('click', (e) => {
    if (sidebar.classList.contains('mobile-open') &&
        !sidebar.contains(e.target) &&
        !mobileMenuBtn.contains(e.target)) {
      sidebar.classList.remove('mobile-open');
    }
  });

  // ══════════════════════════════════════════════════════
  // NAVIGATION
  // ══════════════════════════════════════════════════════
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pages = document.querySelectorAll('.page');

  const pageNames = {
    dashboard: 'Dashboard',
    analytics: 'Analitik',
    commands: 'Perintah',
    automod: 'Auto-Moderasi',
    modlogs: 'Log Moderasi',
    warnings: 'Peringatan',
    welcome: 'Selamat Datang',
    levels: 'Leveling',
    music: 'Musik',
    tickets: 'Tiket',
    plugins: 'Plugin',
    config: 'Konfigurasi',
    settings: 'Pengaturan',
  };

  function navigateTo(pageId) {
    // Update active nav
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.page === pageId);
    });

    // Show page
    pages.forEach(page => {
      page.classList.toggle('active', page.id === `page-${pageId}`);
    });

    // Update breadcrumb
    breadcrumbText.textContent = pageNames[pageId] || pageId;

    // Close mobile sidebar
    sidebar.classList.remove('mobile-open');
    document.body.classList.remove('sidebar-open');

  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // ══════════════════════════════════════════════════════
  // THEME TOGGLE
  // ══════════════════════════════════════════════════════
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'dark';
  html.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  themeToggle?.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    showToast('info', 'Tema Diubah', `Mode ${next === 'dark' ? 'gelap' : 'terang'} aktif`);
  });

  function updateThemeIcon(theme) {
    const icon = themeToggle?.querySelector('i');
    if (icon) {
      icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }
  }

  // ══════════════════════════════════════════════════════
  // SERVER SELECTOR
  // ══════════════════════════════════════════════════════
  serverCurrent?.addEventListener('click', (e) => {
    e.stopPropagation();
    serverCurrent.classList.toggle('open');
    serverDropdown.classList.toggle('open');
  });

  document.querySelectorAll('.server-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.server-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Update current server display
      const name = item.querySelector('.server-name').textContent;
      const avatar = item.querySelector('.server-avatar');
      serverCurrent.querySelector('.server-name').textContent = name;
      serverCurrent.querySelector('.server-avatar').textContent = avatar.textContent;
      serverCurrent.querySelector('.server-avatar').style.background = avatar.style.background;

      serverCurrent.classList.remove('open');
      serverDropdown.classList.remove('open');

      showToast('success', 'Server Diubah', `Beralih ke ${name}`);
    });
  });

  // ══════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ══════════════════════════════════════════════════════
  notifBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle('open');
  });

  notifClear?.addEventListener('click', () => {
    document.querySelectorAll('.notif-item.unread').forEach(item => {
      item.classList.remove('unread');
    });
    const badge = notifBtn.querySelector('.notif-badge');
    if (badge) badge.style.display = 'none';
    showToast('success', 'Notifikasi', 'Semua notifikasi ditandai telah dibaca');
  });

  // ══════════════════════════════════════════════════════
  // COMMAND PALETTE (Ctrl+K)
  // ══════════════════════════════════════════════════════
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openCmdPalette();
    }
    if (e.key === 'Escape') {
      closeCmdPalette();
      closeModal();
      notifPanel?.classList.remove('open');
      serverCurrent?.classList.remove('open');
      serverDropdown?.classList.remove('open');
    }
  });

  function openCmdPalette() {
    cmdPalette.classList.add('open');
    cmdPaletteInput.value = '';
    cmdPaletteInput.focus();
    filterPaletteItems('');
  }

  function closeCmdPalette() {
    cmdPalette.classList.remove('open');
  }

  cmdPalette?.addEventListener('click', (e) => {
    if (e.target === cmdPalette) closeCmdPalette();
  });

  // Filter palette items
  cmdPaletteInput?.addEventListener('input', () => {
    filterPaletteItems(cmdPaletteInput.value.toLowerCase());
  });

  function filterPaletteItems(query) {
    const items = document.querySelectorAll('.cmd-palette-item');
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? '' : 'none';
    });

    // Hide empty groups
    document.querySelectorAll('.cmd-palette-group').forEach(group => {
      const visible = group.querySelectorAll('.cmd-palette-item:not([style*="display: none"])');
      group.style.display = visible.length ? '' : 'none';
    });
  }

  // Palette actions
  document.querySelectorAll('.cmd-palette-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      if (action?.startsWith('nav:')) {
        navigateTo(action.split(':')[1]);
      } else if (action === 'toggle-theme') {
        themeToggle?.click();
      } else if (action === 'restart-bot') {
        showToast('info', 'Bot', 'Memulai ulang bot...');
      }
      closeCmdPalette();
    });
  });

  // Also trigger from search box click
  document.getElementById('searchInput')?.addEventListener('focus', (e) => {
    e.target.blur();
    openCmdPalette();
  });

  // ══════════════════════════════════════════════════════
  // CLOSE PANELS ON OUTSIDE CLICK
  // ══════════════════════════════════════════════════════
  document.addEventListener('click', (e) => {
    if (!notifBtn?.contains(e.target) && !notifPanel?.contains(e.target)) {
      notifPanel?.classList.remove('open');
    }
    if (!serverCurrent?.contains(e.target) && !serverDropdown?.contains(e.target)) {
      serverCurrent?.classList.remove('open');
      serverDropdown?.classList.remove('open');
    }
    // Klik di luar sidebar saat drawer mobile terbuka -> tutup drawer
    if (
      sidebar.classList.contains('mobile-open') &&
      !sidebar.contains(e.target) &&
      !mobileMenuBtn?.contains(e.target) &&
      !backdrop?.contains(e.target)
    ) {
      sidebar.classList.remove('mobile-open');
      document.body.classList.remove('sidebar-open');
    }
  });

  // ══════════════════════════════════════════════════════
  // MODAL
  // ══════════════════════════════════════════════════════
  function openModal(title, body, footer) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = body;
    document.getElementById('modalFooter').innerHTML = footer || '';
    modalOverlay.classList.add('open');
  }

  function closeModal() {
    modalOverlay?.classList.remove('open');
  }

  modalClose?.addEventListener('click', closeModal);
  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // ══════════════════════════════════════════════════════
  // TOAST NOTIFICATIONS
  // ══════════════════════════════════════════════════════
  function showToast(type, title, message, duration = 4000) {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-circle-xmark',
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation',
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas ${icons[type]} toast-icon"></i>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close"><i class="fas fa-xmark"></i></button>
    `;

    toastContainer.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => removeToast(toast));

    setTimeout(() => removeToast(toast), duration);
  }

  function removeToast(toast) {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }

  // ══════════════════════════════════════════════════════
  // COMMANDS PAGE — FILTER
  // ══════════════════════════════════════════════════════
  const filterChips = document.querySelectorAll('.filter-chip[data-filter]');
  const commandCards = document.querySelectorAll('.command-card');

  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const filter = chip.dataset.filter;
      commandCards.forEach(card => {
        if (filter === 'all' || card.dataset.category === filter) {
          card.style.display = '';
          card.style.animation = 'fadeIn 0.3s ease';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // Command search
  document.getElementById('cmdSearch')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    commandCards.forEach(card => {
      const name = card.querySelector('.cmd-name')?.textContent.toLowerCase() || '';
      const desc = card.querySelector('.cmd-desc')?.textContent.toLowerCase() || '';
      card.style.display = (name.includes(query) || desc.includes(query)) ? '' : 'none';
    });
  });

  // ══════════════════════════════════════════════════════
  // RANGE INPUTS — LIVE VALUE
  // ══════════════════════════════════════════════════════
  document.querySelectorAll('.range-input input[type="range"]').forEach(range => {
    const valueEl = range.parentElement.querySelector('.range-value');
    range.addEventListener('input', () => {
      if (valueEl) valueEl.textContent = range.value;
    });
  });

  // ══════════════════════════════════════════════════════
  // QUICK ACTIONS
  // ══════════════════════════════════════════════════════
  document.querySelectorAll('.quick-action').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const actionNames = {
        announce: 'Pengumuman',
        embed: 'Buat Embed',
        giveaway: 'Giveaway',
        poll: 'Buat Poll',
        backup: 'Backup Server',
        restart: 'Restart Bot',
      };

      if (action === 'restart') {
        openModal('Restart Bot', `
          <p style="color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px;">
            Apakah kamu yakin ingin me-restart bot? Bot akan offline selama beberapa detik.
          </p>
          <div style="display: flex; align-items: center; gap: 8px; padding: 12px; background: rgba(245,158,11,0.08); border-radius: 8px; border: 1px solid rgba(245,158,11,0.15);">
            <i class="fas fa-triangle-exclamation" style="color: var(--amber);"></i>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">Semua operasi yang sedang berjalan akan dihentikan</span>
          </div>
        `, `
          <button class="btn btn-ghost" onclick="document.getElementById('modalOverlay').classList.remove('open')">Batal</button>
          <button class="btn btn-primary" onclick="document.getElementById('modalOverlay').classList.remove('open')">
            <i class="fas fa-rotate"></i> Restart
          </button>
        `);
      } else {
        showToast('info', actionNames[action] || action, `Membuka ${actionNames[action]}...`);
      }
    });
  });

  // ══════════════════════════════════════════════════════
  // SETTINGS NAV
  // ══════════════════════════════════════════════════════
  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

  // ══════════════════════════════════════════════════════
  // BUTTON GROUP CHIPS
  // ══════════════════════════════════════════════════════
  document.querySelectorAll('.btn-group').forEach(group => {
    group.querySelectorAll('.btn-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.btn-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  });

  // ══════════════════════════════════════════════════════
  // SENSITIVITY BUTTONS
  // ══════════════════════════════════════════════════════
  document.querySelectorAll('.sensitivity-selector').forEach(group => {
    group.querySelectorAll('.sens-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.sens-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });

  // ══════════════════════════════════════════════════════
  // VARIABLE TAGS — COPY
  // ══════════════════════════════════════════════════════
  document.querySelectorAll('.var-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const val = tag.dataset.var;
      navigator.clipboard?.writeText(val);
      showToast('success', 'Disalin', `${val} disalin ke clipboard`);
    });
  });

  // ══════════════════════════════════════════════════════
  // COLOR PICKER SYNC
  // ══════════════════════════════════════════════════════
  document.querySelectorAll('.color-input').forEach(input => {
    input.addEventListener('input', () => {
      const hex = input.value.toUpperCase();
      const hexDisplay = input.parentElement.querySelector('.color-hex');
      if (hexDisplay) hexDisplay.textContent = hex;

      // Update Discord preview embed border
      const embed = document.querySelector('.discord-embed');
      if (embed) embed.style.borderLeftColor = hex;
    });
  });

  // ══════════════════════════════════════════════════════
  // TOGGLE SWITCH FEEDBACK
  // ══════════════════════════════════════════════════════
  document.querySelectorAll('.toggle input[type="checkbox"]').forEach(toggle => {
    toggle.addEventListener('change', () => {
      const card = toggle.closest('.command-card, .automod-card');
      if (card) {
        const name = card.querySelector('.cmd-name, .automod-info h3')?.textContent?.trim();
        if (name) {
          showToast(
            toggle.checked ? 'success' : 'warning',
            toggle.checked ? 'Diaktifkan' : 'Dinonaktifkan',
            `${name} telah ${toggle.checked ? 'diaktifkan' : 'dinonaktifkan'}`
          );
        }
      }
    });
  });

  // ══════════════════════════════════════════════════════
  // KEYBOARD NAVIGATION — PALETTE
  // ══════════════════════════════════════════════════════
  let focusedPaletteIndex = -1;

  cmdPaletteInput?.addEventListener('keydown', (e) => {
    const items = [...document.querySelectorAll('.cmd-palette-item:not([style*="display: none"])')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedPaletteIndex = Math.min(focusedPaletteIndex + 1, items.length - 1);
      updatePaletteFocus(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedPaletteIndex = Math.max(focusedPaletteIndex - 1, 0);
      updatePaletteFocus(items);
    } else if (e.key === 'Enter' && focusedPaletteIndex >= 0) {
      items[focusedPaletteIndex]?.click();
    }
  });

  function updatePaletteFocus(items) {
    items.forEach((item, i) => {
      item.classList.toggle('focused', i === focusedPaletteIndex);
    });
    items[focusedPaletteIndex]?.scrollIntoView({ block: 'nearest' });
  }

  // ══════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════
  // Show welcome toast
  setTimeout(() => {
    showToast('success', 'Selamat Datang! 👋', 'Dashboard Bot Caches berhasil dimuat');
  }, 800);
});
