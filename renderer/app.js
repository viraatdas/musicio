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

  if (service === 'blend') renderBlend();
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
// Daily Blend
// ============================================

const BLEND_KEY = 'musicio-blend';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadBlend() {
  try {
    const data = JSON.parse(localStorage.getItem(BLEND_KEY)) || {};
    return data;
  } catch { return {}; }
}

function saveBlend(data) {
  localStorage.setItem(BLEND_KEY, JSON.stringify(data));
}

function getBlendSongs() {
  const data = loadBlend();
  return data.songs || [];
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Seeded shuffle for consistent daily order
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

function getDailyOrder(songs) {
  const today = todayKey();
  let seed = 0;
  for (const ch of today) seed = seed * 31 + ch.charCodeAt(0);
  return seededShuffle(songs, Math.abs(seed));
}

// Capture now-playing from the last active music service
async function captureNowPlaying() {
  // Determine which music service was last active
  const musicService = (activeService === 'spotify' || activeService === 'youtube')
    ? activeService
    : localStorage.getItem('musicio-last-music') || 'spotify';

  const wv = webviews[musicService];
  if (!wv) return null;

  let script;
  if (musicService === 'spotify') {
    script = `
      (() => {
        const titleEl = document.querySelector('[data-testid="context-item-link"]')
          || document.querySelector('.Root__now-playing-bar a[href*="/track/"]')
          || document.querySelector('a[data-testid="nowplaying-track-link"]');
        const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"] a')
          || document.querySelector('.Root__now-playing-bar span a[href*="/artist/"]');
        if (!titleEl) return null;
        return {
          title: titleEl.textContent?.trim() || '',
          artist: artistEl?.textContent?.trim() || 'Unknown Artist',
        };
      })()
    `;
  } else {
    script = `
      (() => {
        const titleEl = document.querySelector('.title.ytmusic-player-bar')
          || document.querySelector('yt-formatted-string.title');
        const artistEl = document.querySelector('.byline.ytmusic-player-bar a')
          || document.querySelector('span.subtitle yt-formatted-string a');
        if (!titleEl) return null;
        return {
          title: titleEl.textContent?.trim() || '',
          artist: artistEl?.textContent?.trim() || 'Unknown Artist',
        };
      })()
    `;
  }

  try {
    const result = await wv.executeJavaScript(script);
    if (!result || !result.title) return null;
    return { ...result, source: musicService };
  } catch {
    return null;
  }
}

// UI: Capture button
document.getElementById('btn-capture')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-capture');
  const song = await captureNowPlaying();

  if (!song) {
    btn.textContent = 'NO SONG DETECTED';
    btn.style.borderColor = 'var(--neon-magenta)';
    btn.style.color = 'var(--neon-magenta)';
    setTimeout(() => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: -2px; margin-right: 6px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>CAPTURE NOW PLAYING`;
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
    return;
  }

  // Check for duplicates
  const songs = getBlendSongs();
  const exists = songs.some(
    (s) => s.title.toLowerCase() === song.title.toLowerCase() && s.source === song.source
  );

  if (exists) {
    btn.textContent = 'ALREADY IN BLEND';
    setTimeout(() => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: -2px; margin-right: 6px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>CAPTURE NOW PLAYING`;
    }, 1500);
    return;
  }

  // Add song
  const data = loadBlend();
  if (!data.songs) data.songs = [];
  data.songs.push({
    id: generateId(),
    title: song.title,
    artist: song.artist,
    source: song.source,
    captured: Date.now(),
  });
  saveBlend(data);

  // Flash feedback
  btn.textContent = `CAPTURED: ${song.title.toUpperCase()}`;
  btn.classList.add('capture-flash');
  setTimeout(() => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="vertical-align: -2px; margin-right: 6px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>CAPTURE NOW PLAYING`;
    btn.classList.remove('capture-flash');
  }, 2000);

  renderBlend();
});

// UI: Shuffle button
document.getElementById('btn-shuffle-blend')?.addEventListener('click', () => {
  // Use a random seed instead of the date seed
  const data = loadBlend();
  data.shuffleSeed = Math.floor(Math.random() * 2147483647);
  saveBlend(data);
  renderBlend();
});

// Track which music service was last active
const origSwitchService = switchService;
const _origSwitch = switchService;

// Render the blend
function renderBlend() {
  const songs = getBlendSongs();
  const blendList = document.getElementById('blend-list');
  const blendEmpty = document.getElementById('blend-empty');
  const dateEl = document.getElementById('blend-date');

  if (dateEl) {
    const d = new Date();
    dateEl.textContent = d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).toUpperCase();
  }

  if (!blendList || !blendEmpty) return;

  if (songs.length === 0) {
    blendList.innerHTML = '';
    blendEmpty.style.display = 'flex';
    return;
  }

  blendEmpty.style.display = 'none';

  // Get shuffled order
  const data = loadBlend();
  const ordered = data.shuffleSeed
    ? seededShuffle(songs, data.shuffleSeed)
    : getDailyOrder(songs);

  blendList.innerHTML = ordered
    .map((song, i) => {
      const timeAgo = getTimeAgo(song.captured);
      return `
        <div class="blend-song">
          <span class="blend-song-num">${i + 1}</span>
          <span class="blend-song-badge ${song.source}">${song.source === 'spotify' ? 'SPOTIFY' : 'YOUTUBE'}</span>
          <div class="blend-song-info">
            <div class="blend-song-title">${escapeHtml(song.title)}</div>
            <div class="blend-song-artist">${escapeHtml(song.artist)}</div>
          </div>
          <span class="blend-song-time">${timeAgo}</span>
          <button class="blend-song-remove" data-id="${song.id}" title="Remove">&times;</button>
        </div>
      `;
    })
    .join('');

  blendList.querySelectorAll('.blend-song-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeSongFromBlend(btn.dataset.id);
    });
  });
}

function removeSongFromBlend(songId) {
  const data = loadBlend();
  data.songs = (data.songs || []).filter((s) => s.id !== songId);
  saveBlend(data);
  renderBlend();
}

function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
