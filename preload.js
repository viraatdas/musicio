const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onMediaKey: (callback) => ipcRenderer.on('media-key', (_event, key) => callback(key)),
  onSwitchTab: (callback) => ipcRenderer.on('switch-tab', (_event, tab) => callback(tab)),
  onReloadWebview: (callback) => ipcRenderer.on('reload-webview', (_event, service) => callback(service)),
  openAuthWindow: (url, partition) => ipcRenderer.send('open-auth-window', url, partition),
  platform: process.platform,
  webviewPreloadPath: `file://${__dirname}/preload-webview.js`,
});
