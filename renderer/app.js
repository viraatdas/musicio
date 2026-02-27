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
  playlists: {
    viewId: 'playlists-view',
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
const playlistsView = document.getElementById('playlists-view');

// ============================================
// Platform Detection & Webview Preload
// ============================================

if (window.electronAPI?.platform === 'darwin') {
  document.body.classList.add('platform-darwin');
}

// Set preload path on webviews (must be absolute file:// URL)
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

  // Update webview visibility
  for (const [key, wv] of Object.entries(webviews)) {
    wv.classList.toggle('active', key === service);
  }

  // Update playlists view
  playlistsView.classList.toggle('active', service === 'playlists');

  // Update sidebar buttons
  sidebarBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.service === service);
  });

  // Update sidebar indicator position
  updateIndicator(service);
}

function updateIndicator(service) {
  const btn = document.querySelector(`.sidebar-btn[data-service="${service}"]`);
  if (!btn || !sidebarIndicator) return;

  const sidebarTop = btn.parentElement.getBoundingClientRect().top;
  const btnTop = btn.getBoundingClientRect().top;
  const offset = btnTop - sidebarTop;

  sidebarIndicator.style.top = `${offset}px`;

  const colors = {
    spotify: { bg: 'var(--neon-cyan)', shadow: 'var(--glow-cyan)' },
    youtube: { bg: 'var(--neon-magenta)', shadow: 'var(--glow-magenta)' },
    playlists: { bg: 'var(--neon-purple)', shadow: 'var(--glow-purple)' },
  };
  const c = colors[service] || colors.spotify;
  sidebarIndicator.style.background = c.bg;
  sidebarIndicator.style.boxShadow = c.shadow;
}

// Sidebar click handlers
sidebarBtns.forEach((btn) => {
  btn.addEventListener('click', () => switchService(btn.dataset.service));
});

// ============================================
// IPC: Tab switching from Menu accelerators
// ============================================

window.electronAPI?.onSwitchTab((tab) => {
  switchService(tab);
});

// ============================================
// IPC: Reload webview after auth
// ============================================

window.electronAPI?.onReloadWebview((service) => {
  const wv = webviews[service];
  if (wv) wv.reload();
});

// ============================================
// Loading Screen
// ============================================

let webviewsReady = 0;
const totalWebviews = Object.keys(webviews).length;

function onWebviewReady() {
  webviewsReady++;
  if (webviewsReady >= totalWebviews) {
    showApp();
  }
}

function showApp() {
  loadingScreen.classList.add('hidden');
  app.classList.add('visible');
  switchService(activeService);
  renderPlaylists();
}

// Listen for webview load events
for (const wv of Object.values(webviews)) {
  wv.addEventListener('did-finish-load', onWebviewReady);
  wv.addEventListener('did-fail-load', onWebviewReady);
}

// Fallback: show app after timeout
setTimeout(() => {
  if (!app.classList.contains('visible')) {
    showApp();
  }
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
      if (!allowed) {
        e.preventDefault();
      }
    } catch (_) { /* ignore invalid URLs */ }
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
  if (wv) {
    wv.executeJavaScript(script).catch(() => {});
  }
});

// ============================================
// Playlists Feature
// ============================================

const STORAGE_KEY = 'musicio-playlists';

function loadPlaylists() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function savePlaylists(playlists) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Modal logic
const modal = document.getElementById('playlist-modal');
const modalTitle = document.getElementById('modal-title');
const modalBodyCreate = document.getElementById('modal-body-create');
const modalBodyAddSong = document.getElementById('modal-body-add-song');
const inputPlaylistName = document.getElementById('input-playlist-name');
const inputSongTitle = document.getElementById('input-song-title');
const inputSongArtist = document.getElementById('input-song-artist');
const inputSongUrl = document.getElementById('input-song-url');
const sourceBtns = document.querySelectorAll('.source-btn');

let currentPlaylistId = null;
let currentSource = 'spotify';

function openCreateModal() {
  modalTitle.textContent = 'NEW PLAYLIST';
  modalBodyCreate.classList.remove('hidden');
  modalBodyAddSong.classList.add('hidden');
  inputPlaylistName.value = '';
  modal.classList.remove('hidden');
  inputPlaylistName.focus();
}

function openAddSongModal(playlistId) {
  currentPlaylistId = playlistId;
  modalTitle.textContent = 'ADD SONG';
  modalBodyCreate.classList.add('hidden');
  modalBodyAddSong.classList.remove('hidden');
  inputSongTitle.value = '';
  inputSongArtist.value = '';
  inputSongUrl.value = '';
  currentSource = 'spotify';
  sourceBtns.forEach((b) => b.classList.toggle('active', b.dataset.source === 'spotify'));
  modal.classList.remove('hidden');
  inputSongTitle.focus();
}

function closeModal() {
  modal.classList.add('hidden');
}

document.getElementById('btn-new-playlist')?.addEventListener('click', openCreateModal);
document.getElementById('modal-close')?.addEventListener('click', closeModal);

modal?.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

sourceBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    currentSource = btn.dataset.source;
    sourceBtns.forEach((b) => b.classList.toggle('active', b === btn));
  });
});

// Create playlist
document.getElementById('btn-create-playlist')?.addEventListener('click', () => {
  const name = inputPlaylistName.value.trim();
  if (!name) return;

  const playlists = loadPlaylists();
  playlists.push({
    id: generateId(),
    name,
    created: Date.now(),
    songs: [],
  });
  savePlaylists(playlists);
  closeModal();
  renderPlaylists();
});

// Handle enter key in playlist name input
inputPlaylistName?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-create-playlist')?.click();
});

// Add song
document.getElementById('btn-add-song')?.addEventListener('click', () => {
  const title = inputSongTitle.value.trim();
  const artist = inputSongArtist.value.trim();
  if (!title) return;

  const playlists = loadPlaylists();
  const playlist = playlists.find((p) => p.id === currentPlaylistId);
  if (!playlist) return;

  playlist.songs.push({
    id: generateId(),
    title,
    artist: artist || 'Unknown',
    source: currentSource,
    url: inputSongUrl.value.trim() || '',
    added: Date.now(),
  });
  savePlaylists(playlists);
  closeModal();
  renderPlaylists();
});

inputSongUrl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-add-song')?.click();
});

// Auto-detect source from URL
inputSongUrl?.addEventListener('input', () => {
  const url = inputSongUrl.value;
  if (url.includes('spotify.com')) {
    currentSource = 'spotify';
    sourceBtns.forEach((b) => b.classList.toggle('active', b.dataset.source === 'spotify'));
  } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
    currentSource = 'youtube';
    sourceBtns.forEach((b) => b.classList.toggle('active', b.dataset.source === 'youtube'));
  }
});

// Render playlists
function renderPlaylists() {
  const playlists = loadPlaylists();
  const grid = document.getElementById('playlists-grid');
  const empty = document.getElementById('playlists-empty');

  if (!grid || !empty) return;

  if (playlists.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = playlists
    .map(
      (pl) => `
    <div class="playlist-card" data-id="${pl.id}">
      <div class="playlist-card-header">
        <span class="playlist-card-name">${escapeHtml(pl.name)}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="playlist-card-count">${pl.songs.length} song${pl.songs.length !== 1 ? 's' : ''}</span>
          <div class="playlist-card-actions">
            <button class="playlist-action-btn add-song-btn" data-id="${pl.id}" title="Add song">+</button>
            <button class="playlist-action-btn delete playlist-delete-btn" data-id="${pl.id}" title="Delete playlist">&times;</button>
          </div>
        </div>
      </div>
      <div class="playlist-songs">
        ${pl.songs
          .map(
            (song) => `
          <div class="song-item">
            <span class="song-source-badge ${song.source}">${song.source === 'spotify' ? 'SP' : 'YT'}</span>
            <div class="song-info">
              <div class="song-title">${song.url ? `<a href="${escapeHtml(song.url)}" style="color:inherit;text-decoration:none;" title="Open in browser">${escapeHtml(song.title)}</a>` : escapeHtml(song.title)}</div>
              <div class="song-artist">${escapeHtml(song.artist)}</div>
            </div>
            <button class="song-remove" data-playlist="${pl.id}" data-song="${song.id}" title="Remove">&times;</button>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `
    )
    .join('');

  // Attach event listeners
  grid.querySelectorAll('.add-song-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddSongModal(btn.dataset.id);
    });
  });

  grid.querySelectorAll('.playlist-delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePlaylist(btn.dataset.id);
    });
  });

  grid.querySelectorAll('.song-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeSong(btn.dataset.playlist, btn.dataset.song);
    });
  });
}

function deletePlaylist(id) {
  const playlists = loadPlaylists().filter((p) => p.id !== id);
  savePlaylists(playlists);
  renderPlaylists();
}

function removeSong(playlistId, songId) {
  const playlists = loadPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (!playlist) return;
  playlist.songs = playlist.songs.filter((s) => s.id !== songId);
  savePlaylists(playlists);
  renderPlaylists();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
