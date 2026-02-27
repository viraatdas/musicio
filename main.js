const {
  app,
  BrowserWindow,
  Menu,
  globalShortcut,
  ipcMain,
  session,
} = require('electron');
const path = require('path');

let mainWindow;

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

  // Spoof user-agent on persistent sessions so web players load properly
  const partitions = ['persist:spotify', 'persist:youtube'];
  for (const partition of partitions) {
    const ses = session.fromPartition(partition);
    ses.setUserAgent(CHROME_USER_AGENT);

    // Allow DRM content (Widevine)
    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowed = [
        'media',
        'mediaKeySystem',
        'notifications',
        'fullscreen',
        'pointerLock',
      ];
      callback(allowed.includes(permission));
    });
  }
}

// ============================================
// Application Menu with Cmd+1/2/3 shortcuts
// ============================================

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Spotify',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendToRenderer('switch-tab', 'spotify'),
        },
        {
          label: 'YouTube Music',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendToRenderer('switch-tab', 'youtube'),
        },
        {
          label: 'My Playlists',
          accelerator: 'CmdOrCtrl+3',
          click: () => sendToRenderer('switch-tab', 'playlists'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
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
// Google Auth Window (fixes YouTube sign-in)
// ============================================

function openAuthWindow(url, partitionName) {
  const ses = session.fromPartition(partitionName);

  const authWin = new BrowserWindow({
    width: 500,
    height: 750,
    parent: mainWindow,
    modal: false,
    backgroundColor: '#fff',
    webPreferences: {
      session: ses,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  authWin.loadURL(url, { userAgent: CHROME_USER_AGENT });

  // Close the auth window when user finishes sign-in and is redirected back
  authWin.webContents.on('will-navigate', (_event, navUrl) => {
    if (
      navUrl.startsWith('https://music.youtube.com') ||
      navUrl.startsWith('https://www.youtube.com')
    ) {
      // Small delay to let cookies settle
      setTimeout(() => {
        if (!authWin.isDestroyed()) authWin.close();
        sendToRenderer('reload-webview', 'youtube');
      }, 500);
    }
  });

  authWin.webContents.on('will-redirect', (_event, navUrl) => {
    if (
      navUrl.startsWith('https://music.youtube.com') ||
      navUrl.startsWith('https://www.youtube.com')
    ) {
      setTimeout(() => {
        if (!authWin.isDestroyed()) authWin.close();
        sendToRenderer('reload-webview', 'youtube');
      }, 500);
    }
  });
}

// Intercept Google sign-in navigations from webviews
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (
      contents.getType() === 'webview' &&
      url.startsWith('https://accounts.google.com')
    ) {
      event.preventDefault();
      openAuthWindow(url, 'persist:youtube');
    }
  });

  // Handle popups from webviews (e.g. OAuth flows)
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://accounts.google.com')) {
        openAuthWindow(url, 'persist:youtube');
        return { action: 'deny' };
      }
      // Allow Spotify OAuth popups
      if (
        url.startsWith('https://accounts.spotify.com') ||
        url.startsWith('https://open.spotify.com')
      ) {
        return { action: 'allow' };
      }
      return { action: 'deny' };
    });
  }
});

// ============================================
// IPC handlers
// ============================================

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());

ipcMain.on('open-auth-window', (_event, url, partition) => {
  openAuthWindow(url, `persist:${partition}`);
});

// ============================================
// Media keys
// ============================================

function registerMediaKeys() {
  const mediaKeys = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack'];
  for (const key of mediaKeys) {
    globalShortcut.register(key, () => {
      sendToRenderer('media-key', key);
    });
  }
}

// ============================================
// App lifecycle
// ============================================

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();
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
