const {
  app,
  components,
  BrowserWindow,
  Menu,
  shell,
  globalShortcut,
  ipcMain,
  session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { Request: AdblockerRequest } = require('@ghostery/adblocker');
const fetch = require('cross-fetch');

let mainWindow;

// ============================================
// Minimal UA cleanup - MUST be before app.whenReady()
// ============================================
const CLEAN_UA = app.userAgentFallback
  .replace(/\s*Electron\/[\d.]+/, '')
  .replace(/\s*musicio\/[\d.]+/i, '');

app.userAgentFallback = CLEAN_UA;

// ============================================
// Ad blocker setup
// ============================================

let _blocker = null;

async function getBlocker() {
  if (!_blocker) {
    _blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  }
  return _blocker;
}

async function setupAdBlocker(ses) {
  try {
    const blocker = await getBlocker();
    // Use webRequest-based blocking (compatible with all Electron versions)
    ses.webRequest.onBeforeRequest((details, callback) => {
      const request = AdblockerRequest.fromRawDetails({
        type: details.resourceType || 'other',
        url: details.url,
        sourceUrl: details.referrer || details.url,
      });
      const { match } = blocker.match(request);
      callback({ cancel: match });
    });
    console.log('Ad blocker enabled for session');
  } catch (err) {
    console.error('Failed to enable ad blocker:', err.message);
  }
}

// ============================================
// Window creation
// ============================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const partitions = ['persist:spotify', 'persist:youtube'];
  for (const partition of partitions) {
    const ses = session.fromPartition(partition);
    ses.setUserAgent(CLEAN_UA);
    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowed = ['media', 'mediaKeySystem', 'notifications', 'fullscreen', 'pointerLock'];
      callback(allowed.includes(permission));
    });
    // Enable ad blocking on each webview session
    setupAdBlocker(ses);
  }
}

// ============================================
// Handle auth popups from webviews
// ============================================

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (
        url.startsWith('https://accounts.spotify.com') ||
        url.startsWith('https://open.spotify.com')
      ) {
        return { action: 'allow' };
      }
      if (
        url.startsWith('https://accounts.google.com') ||
        url.startsWith('https://myaccount.google.com')
      ) {
        return { action: 'allow' };
      }
      return { action: 'deny' };
    });
  }
});

// ============================================
// Application Menu
// ============================================

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' }, { type: 'separator' }, { role: 'services' },
            { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' },
            { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Spotify', accelerator: 'CmdOrCtrl+1', click: () => sendToRenderer('switch-tab', 'spotify') },
        { label: 'YouTube Music', accelerator: 'CmdOrCtrl+2', click: () => sendToRenderer('switch-tab', 'youtube') },
        { label: 'Daily Blend', accelerator: 'CmdOrCtrl+3', click: () => sendToRenderer('switch-tab', 'blend') },
        { type: 'separator' },
        { role: 'reload' }, { role: 'toggleDevTools' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// ============================================
// IPC handlers
// ============================================

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.on('open-auth-window', (_event, url, _partition) => {
  shell.openExternal(url);
});

// Import cookies into a webview session
ipcMain.handle('import-cookies', async (_event, { partition, cookies }) => {
  const ses = session.fromPartition(partition);
  let imported = 0;
  const errors = [];

  for (const cookie of cookies) {
    try {
      const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const protocol = cookie.secure ? 'https' : 'http';
      const url = `${protocol}://${domain}${cookie.path || '/'}`;

      const cookieDetails = {
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
      };
      if (cookie.secure !== undefined) cookieDetails.secure = cookie.secure;
      if (cookie.httpOnly !== undefined) cookieDetails.httpOnly = cookie.httpOnly;
      if (cookie.expirationDate && cookie.expirationDate > 0) {
        cookieDetails.expirationDate = cookie.expirationDate;
      }
      if (cookie.sameSite) {
        const siteMap = { no_restriction: 'no_restriction', lax: 'lax', strict: 'strict' };
        cookieDetails.sameSite = siteMap[cookie.sameSite] || 'no_restriction';
      }

      await ses.cookies.set(cookieDetails);
      imported++;
    } catch (err) {
      errors.push(`${cookie.name}: ${err.message}`);
    }
  }

  return { imported, errors };
});

// ============================================
// Media keys
// ============================================

function registerMediaKeys() {
  const mediaKeys = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack'];
  for (const key of mediaKeys) {
    globalShortcut.register(key, () => sendToRenderer('media-key', key));
  }
}

// ============================================
// Auto-import pending cookies on startup
// ============================================

async function importPendingCookies() {
  // Check both __dirname (dev) and userData (installed app)
  const locations = [
    path.join(__dirname, '.pending-cookies.json'),
    path.join(app.getPath('userData'), '.pending-cookies.json'),
  ];

  for (const cookieFile of locations) {
    if (!fs.existsSync(cookieFile)) continue;

    try {
      const raw = fs.readFileSync(cookieFile, 'utf-8');
      const cookies = JSON.parse(raw);
      const ses = session.fromPartition('persist:youtube');
      let imported = 0;

      for (const cookie of cookies) {
        try {
          const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          const protocol = cookie.secure ? 'https' : 'http';
          const url = `${protocol}://${domain}${cookie.path || '/'}`;

          const details = {
            url,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
          };
          if (cookie.secure !== undefined) details.secure = cookie.secure;
          if (cookie.httpOnly !== undefined) details.httpOnly = cookie.httpOnly;
          if (cookie.expirationDate && cookie.expirationDate > 0) {
            details.expirationDate = cookie.expirationDate;
          }
          if (cookie.sameSite) details.sameSite = cookie.sameSite;

          await ses.cookies.set(details);
          imported++;
        } catch (err) {
          console.error(`Cookie import failed for ${cookie.name}: ${err.message}`);
        }
      }

      console.log(`Imported ${imported}/${cookies.length} YouTube cookies from ${cookieFile}`);
      fs.unlinkSync(cookieFile);
    } catch (err) {
      console.error('Failed to import pending cookies:', err.message);
    }
  }
}

// ============================================
// App lifecycle
// ============================================

app.whenReady().then(async () => {
  // Initialize Widevine CDM (castlabs fork auto-downloads it)
  if (components && components.whenReady) {
    try {
      await components.whenReady();
      console.log('Widevine CDM ready');
    } catch (err) {
      console.error('Widevine CDM init failed:', err.message);
    }
  }

  buildAppMenu();
  createWindow();
  await importPendingCookies();
  registerMediaKeys();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
