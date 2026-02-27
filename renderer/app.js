// ============================================
// MUSICIO - Renderer Process
// ============================================

const SERVICES = {
  spotify: {
    webviewId: 'webview-spotify',
    allowedOrigins: ['https://open.spotify.com', 'https://accounts.spotify.com'],
  },
  youtube: {
    webviewId: 'webview-youtube',
    allowedOrigins: ['https://music.youtube.com', 'https://accounts.google.com', 'https://www.youtube.com'],
  },
  blend: {
    viewId: 'blend-view',
  },
};

let activeService = localStorage.getItem('musicio-active') || 'spotify';

// ============================================
// DOM References
// ============================================

const loadingScreen = document.getElementById('loading-screen');
const app = document.getElementById('app');
const sidebarBtns = document.querySelectorAll('.sidebar-btn[data-service]');
const sidebarIndicator = document.querySelector('.sidebar-indicator');
const webviews = {
  spotify: document.getElementById('webview-spotify'),
  youtube: document.getElementById('webview-youtube'),
};
const blendView = document.getElementById('blend-view');

// ============================================
// Platform Detection & Webview Preload
// ============================================

if (window.electronAPI?.platform === 'darwin') {
  document.body.classList.add('platform-darwin');
}

const preloadPath = window.electronAPI?.webviewPreloadPath;
if (preloadPath) {
  for (const wv of Object.values(webviews)) {
    wv.setAttribute('preload', preloadPath);
  }
}

// ============================================
// Window Controls (non-macOS)
// ============================================

document.getElementById('btn-minimize')?.addEventListener('click', () => window.electronAPI?.minimize());
document.getElementById('btn-maximize')?.addEventListener('click', () => window.electronAPI?.maximize());
document.getElementById('btn-close')?.addEventListener('click', () => window.electronAPI?.close());

// ============================================
// Tab Switching
// ============================================

function switchService(service) {
  if (!SERVICES[service]) return;
  activeService = service;
  localStorage.setItem('musicio-active', service);

  for (const [key, wv] of Object.entries(webviews)) {
    wv.classList.toggle('active', key === service);
  }
  blendView.classList.toggle('active', service === 'blend');

  sidebarBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.service === service);
  });

  updateIndicator(service);

  if (service === 'blend') {
    fetchDailyBlend().then(() => renderBlend());
  }
}

function updateIndicator(service) {
  const btn = document.querySelector(`.sidebar-btn[data-service="${service}"]`);
  if (!btn || !sidebarIndicator) return;

  const sidebarTop = btn.parentElement.getBoundingClientRect().top;
  const btnTop = btn.getBoundingClientRect().top;
  sidebarIndicator.style.top = `${btnTop - sidebarTop}px`;

  const colors = {
    spotify: { bg: 'var(--neon-cyan)', shadow: 'var(--glow-cyan)' },
    youtube: { bg: 'var(--neon-magenta)', shadow: 'var(--glow-magenta)' },
    blend: { bg: 'var(--neon-purple)', shadow: 'var(--glow-purple)' },
  };
  const c = colors[service] || colors.spotify;
  sidebarIndicator.style.background = c.bg;
  sidebarIndicator.style.boxShadow = c.shadow;
}

sidebarBtns.forEach((btn) => {
  btn.addEventListener('click', () => switchService(btn.dataset.service));
});

// ============================================
// IPC: Tab switching from Menu accelerators
// ============================================

window.electronAPI?.onSwitchTab((tab) => switchService(tab));

// ============================================
// IPC: Reload webview after auth
// ============================================

window.electronAPI?.onReloadWebview((service) => {
  webviews[service]?.reload();
});

// ============================================
// Loading Screen
// ============================================

let webviewsReady = 0;
const totalWebviews = Object.keys(webviews).length;

function onWebviewReady() {
  webviewsReady++;
  if (webviewsReady >= totalWebviews) showApp();
}

function showApp() {
  loadingScreen.classList.add('hidden');
  app.classList.add('visible');
  switchService(activeService);
}

for (const wv of Object.values(webviews)) {
  wv.addEventListener('did-finish-load', onWebviewReady);
  wv.addEventListener('did-fail-load', onWebviewReady);
}

setTimeout(() => {
  if (!app.classList.contains('visible')) showApp();
}, 8000);

// ============================================
// Navigation Guards
// ============================================

for (const [service, config] of Object.entries(SERVICES)) {
  if (!config.allowedOrigins) continue;
  const wv = webviews[service];
  if (!wv) continue;
  wv.addEventListener('will-navigate', (e) => {
    try {
      const allowed = config.allowedOrigins.some((origin) => e.url.startsWith(origin));
      if (!allowed) e.preventDefault();
    } catch (_) {}
  });
}

// ============================================
// Media Key Forwarding
// ============================================

const MEDIA_KEY_MAP = {
  MediaPlayPause: 'window.__musicioMedia?.playPause()',
  MediaNextTrack: 'window.__musicioMedia?.nextTrack()',
  MediaPreviousTrack: 'window.__musicioMedia?.prevTrack()',
};

window.electronAPI?.onMediaKey((key) => {
  const script = MEDIA_KEY_MAP[key];
  if (!script) return;
  const wv = webviews[activeService];
  if (wv) wv.executeJavaScript(script).catch(() => {});
});

// ============================================
// Daily Blend - Auto-curated from both services
// ============================================

const BLEND_KEY = 'musicio-blend';
const SONGS_PER_SERVICE = 5;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadBlend() {
  try { return JSON.parse(localStorage.getItem(BLEND_KEY)) || {}; }
  catch { return {}; }
}

function saveBlend(data) {
  localStorage.setItem(BLEND_KEY, JSON.stringify(data));
}

function seededShuffle(arr, seed) {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getDailySeed() {
  const today = todayKey();
  let seed = 0;
  for (const ch of today) seed = seed * 31 + ch.charCodeAt(0);
  return Math.abs(seed);
}

// ---- Scraping scripts ----

const SPOTIFY_SCRAPE = `
(() => {
  const songs = [];
  const seen = new Set();

  function add(title, artist) {
    const key = (title + '|' + artist).toLowerCase();
    if (!title || seen.has(key)) return;
    seen.add(key);
    songs.push({ title, artist: artist || 'Unknown Artist' });
  }

  // Strategy 1: Tracklist rows (playlists, albums, liked songs, search results)
  document.querySelectorAll('[data-testid="tracklist-row"]').forEach(row => {
    const titleEl = row.querySelector('a[data-testid="internal-track-link"] div')
      || row.querySelector('[data-testid="internal-track-link"]');
    const artistEls = row.querySelectorAll('a[href*="/artist/"]');
    const title = titleEl?.textContent?.trim();
    const artist = artistEls.length > 0
      ? [...artistEls].map(a => a.textContent.trim()).join(', ')
      : '';
    add(title, artist);
  });

  // Strategy 2: Home page recommendation cards
  if (songs.length < 3) {
    document.querySelectorAll('[data-testid="card-click-handler"]').forEach(card => {
      const title = card.querySelector('[data-testid="card-title"] a')?.textContent?.trim()
        || card.querySelector('[data-testid="card-title"]')?.textContent?.trim();
      const subtitle = card.querySelector('[data-testid="card-subtitle"]')?.textContent?.trim();
      add(title, subtitle);
    });
  }

  // Strategy 3: Now playing bar (at least get current song)
  if (songs.length === 0) {
    const titleEl = document.querySelector('[data-testid="context-item-link"]')
      || document.querySelector('a[data-testid="nowplaying-track-link"]');
    const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"] a');
    if (titleEl) add(titleEl.textContent?.trim(), artistEl?.textContent?.trim());
  }

  return songs;
})()
`;

const YOUTUBE_SCRAPE = `
(() => {
  const songs = [];
  const seen = new Set();

  function add(title, artist) {
    const key = (title + '|' + artist).toLowerCase();
    if (!title || seen.has(key)) return;
    seen.add(key);
    songs.push({ title, artist: artist || 'Unknown Artist' });
  }

  // Strategy 1: Responsive list items (Quick picks, Listen again, recommendations)
  document.querySelectorAll('ytmusic-responsive-list-item-renderer').forEach(item => {
    const title = item.querySelector('.title-column yt-formatted-string.title')?.textContent?.trim()
      || item.querySelector('yt-formatted-string.title')?.textContent?.trim();
    const artistEl = item.querySelector('.secondary-flex-columns yt-formatted-string a')
      || item.querySelector('.secondary-flex-columns yt-formatted-string');
    add(title, artistEl?.textContent?.trim());
  });

  // Strategy 2: Shelf items / two-row items (carousels on home page)
  if (songs.length < 3) {
    document.querySelectorAll('ytmusic-two-row-item-renderer').forEach(item => {
      const title = item.querySelector('yt-formatted-string.title a')?.textContent?.trim()
        || item.querySelector('yt-formatted-string.title')?.textContent?.trim();
      const subtitle = item.querySelector('.subtitle yt-formatted-string a')?.textContent?.trim()
        || item.querySelector('.subtitle yt-formatted-string')?.textContent?.trim();
      add(title, subtitle);
    });
  }

  // Strategy 3: Queue / Up Next items
  if (songs.length < 3) {
    document.querySelectorAll('ytmusic-player-queue-item').forEach(item => {
      const title = item.querySelector('.song-title')?.textContent?.trim();
      const artist = item.querySelector('.byline')?.textContent?.trim();
      add(title, artist);
    });
  }

  // Strategy 4: Now playing bar
  if (songs.length === 0) {
    const title = document.querySelector('.title.ytmusic-player-bar')?.textContent?.trim();
    const artist = document.querySelector('.byline.ytmusic-player-bar a')?.textContent?.trim();
    if (title) add(title, artist);
  }

  return songs;
})()
`;

async function scrapeService(service) {
  const wv = webviews[service];
  if (!wv) return [];
  const script = service === 'spotify' ? SPOTIFY_SCRAPE : YOUTUBE_SCRAPE;
  try {
    const results = await wv.executeJavaScript(script);
    return (results || []).map(s => ({ ...s, source: service }));
  } catch {
    return [];
  }
}

async function fetchDailyBlend(forceRefresh = false) {
  const data = loadBlend();
  const today = todayKey();

  // Return cached if same day and not forcing refresh
  if (!forceRefresh && data.date === today && data.songs && data.songs.length > 0) {
    return data.songs;
  }

  // Show loading state
  const blendLoading = document.getElementById('blend-loading');
  const blendEmpty = document.getElementById('blend-empty');
  const blendList = document.getElementById('blend-list');
  if (blendLoading) blendLoading.style.display = 'flex';
  if (blendEmpty) blendEmpty.style.display = 'none';
  if (blendList) blendList.innerHTML = '';

  // Scrape both services in parallel
  const [spotifySongs, youtubeSongs] = await Promise.all([
    scrapeService('spotify'),
    scrapeService('youtube'),
  ]);

  // Pick up to SONGS_PER_SERVICE from each, fill remainder from the other
  let picked = [];
  const sPick = spotifySongs.slice(0, SONGS_PER_SERVICE);
  const yPick = youtubeSongs.slice(0, SONGS_PER_SERVICE);
  picked = [...sPick, ...yPick];

  // If one service returned fewer, fill from the other
  if (sPick.length < SONGS_PER_SERVICE && youtubeSongs.length > SONGS_PER_SERVICE) {
    const extra = youtubeSongs.slice(SONGS_PER_SERVICE, SONGS_PER_SERVICE + (SONGS_PER_SERVICE - sPick.length));
    picked.push(...extra);
  }
  if (yPick.length < SONGS_PER_SERVICE && spotifySongs.length > SONGS_PER_SERVICE) {
    const extra = spotifySongs.slice(SONGS_PER_SERVICE, SONGS_PER_SERVICE + (SONGS_PER_SERVICE - yPick.length));
    picked.push(...extra);
  }

  // Shuffle with daily seed
  picked = seededShuffle(picked, getDailySeed());

  // Cache
  saveBlend({ date: today, songs: picked, shuffleSeed: null });

  if (blendLoading) blendLoading.style.display = 'none';
  return picked;
}

// ---- Blend UI ----

document.getElementById('btn-refresh-blend')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-refresh-blend');
  btn.disabled = true;
  btn.textContent = 'SCANNING...';
  await fetchDailyBlend(true);
  renderBlend();
  btn.disabled = false;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align: -2px; margin-right: 6px;"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>REFRESH';
});

document.getElementById('btn-shuffle-blend')?.addEventListener('click', () => {
  const data = loadBlend();
  if (data.songs && data.songs.length > 0) {
    data.shuffleSeed = Math.floor(Math.random() * 2147483647);
    data.songs = seededShuffle(data.songs, data.shuffleSeed);
    saveBlend(data);
    renderBlend();
  }
});

async function renderBlend() {
  const data = loadBlend();
  const songs = data.songs || [];
  const blendList = document.getElementById('blend-list');
  const blendEmpty = document.getElementById('blend-empty');
  const blendLoading = document.getElementById('blend-loading');
  const dateEl = document.getElementById('blend-date');

  if (dateEl) {
    const d = new Date();
    dateEl.textContent = d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }).toUpperCase();
  }

  if (blendLoading) blendLoading.style.display = 'none';
  if (!blendList || !blendEmpty) return;

  if (songs.length === 0) {
    blendList.innerHTML = '';
    blendEmpty.style.display = 'flex';
    return;
  }

  blendEmpty.style.display = 'none';

  blendList.innerHTML = songs
    .map((song, i) => `
      <div class="blend-song" data-source="${song.source}" data-title="${escapeHtml(song.title)}">
        <span class="blend-song-num">${i + 1}</span>
        <span class="blend-song-badge ${song.source}">${song.source === 'spotify' ? 'SP' : 'YT'}</span>
        <div class="blend-song-info">
          <div class="blend-song-title">${escapeHtml(song.title)}</div>
          <div class="blend-song-artist">${escapeHtml(song.artist)}</div>
        </div>
        <button class="blend-song-play" data-source="${song.source}">PLAY ></button>
      </div>
    `)
    .join('');

  // Click to switch to the song's service
  blendList.querySelectorAll('.blend-song-play').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchService(btn.dataset.source);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// Cookie Import for YouTube Music
// ============================================

const cookieModal = document.getElementById('cookie-modal');
const cookieInput = document.getElementById('cookie-input');
const cookieStatus = document.getElementById('cookie-status');

function showCookieModal() {
  cookieModal.classList.add('visible');
  cookieInput.value = '';
  cookieStatus.textContent = '';
  cookieStatus.className = 'modal-status';
  cookieInput.focus();
}

function hideCookieModal() {
  cookieModal.classList.remove('visible');
}

document.getElementById('btn-yt-cookies')?.addEventListener('click', showCookieModal);
document.getElementById('modal-close')?.addEventListener('click', hideCookieModal);
document.getElementById('btn-cookie-cancel')?.addEventListener('click', hideCookieModal);

// Close modal on overlay click
cookieModal?.addEventListener('click', (e) => {
  if (e.target === cookieModal) hideCookieModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cookieModal?.classList.contains('visible')) {
    hideCookieModal();
  }
});

function parseCookieData(raw) {
  const trimmed = raw.trim();

  // Try JSON array format (Cookie-Editor / EditThisCookie)
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) throw new Error('Expected a JSON array of cookies');
    return arr.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      secure: c.secure ?? true,
      httpOnly: c.httpOnly ?? false,
      expirationDate: c.expirationDate || c.expiry || 0,
      sameSite: c.sameSite || 'no_restriction',
    }));
  }

  // Try Netscape cookies.txt format
  // Lines like: .youtube.com	TRUE	/	TRUE	1234567890	NAME	value
  const lines = trimmed.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length > 0 && lines[0].split('\t').length >= 7) {
    return lines.map((line) => {
      const parts = line.split('\t');
      if (parts.length < 7) throw new Error(`Invalid cookies.txt line: ${line}`);
      return {
        domain: parts[0],
        path: parts[2],
        secure: parts[3].toUpperCase() === 'TRUE',
        expirationDate: parseInt(parts[4], 10) || 0,
        name: parts[5],
        value: parts[6],
        httpOnly: parts[1].toUpperCase() === 'TRUE',
        sameSite: 'no_restriction',
      };
    });
  }

  throw new Error('Unrecognized format. Paste JSON from Cookie-Editor or cookies.txt format.');
}

document.getElementById('btn-cookie-import')?.addEventListener('click', async () => {
  const raw = cookieInput.value;
  if (!raw.trim()) {
    cookieStatus.textContent = 'Please paste cookie data first.';
    cookieStatus.className = 'modal-status error';
    return;
  }

  let cookies;
  try {
    cookies = parseCookieData(raw);
  } catch (err) {
    cookieStatus.textContent = `Parse error: ${err.message}`;
    cookieStatus.className = 'modal-status error';
    return;
  }

  if (cookies.length === 0) {
    cookieStatus.textContent = 'No cookies found in the pasted data.';
    cookieStatus.className = 'modal-status error';
    return;
  }

  cookieStatus.textContent = `Importing ${cookies.length} cookies...`;
  cookieStatus.className = 'modal-status';

  try {
    const result = await window.electronAPI.importCookies('persist:youtube', cookies);
    if (result.imported > 0) {
      cookieStatus.textContent = `Imported ${result.imported} cookies. Reloading YouTube Music...`;
      cookieStatus.className = 'modal-status success';

      // Reload YouTube Music webview after a short delay
      setTimeout(() => {
        webviews.youtube?.reload();
        hideCookieModal();
      }, 1500);
    } else {
      cookieStatus.textContent = `Failed to import cookies. ${result.errors.length ? result.errors[0] : ''}`;
      cookieStatus.className = 'modal-status error';
    }
  } catch (err) {
    cookieStatus.textContent = `Import error: ${err.message}`;
    cookieStatus.className = 'modal-status error';
  }
});
