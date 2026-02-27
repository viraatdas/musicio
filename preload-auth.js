// Preload for the Google auth BrowserWindow.
// Patches browser APIs so Google's sign-in page sees real Chrome, not Electron.

const CHROME_VERSION = '131';

// Override navigator.userAgentData to match real Chrome
Object.defineProperty(navigator, 'userAgentData', {
  get: () => ({
    brands: [
      { brand: 'Google Chrome', version: CHROME_VERSION },
      { brand: 'Chromium', version: CHROME_VERSION },
      { brand: 'Not_A Brand', version: '24' },
    ],
    mobile: false,
    platform: 'macOS',
    getHighEntropyValues(hints) {
      return Promise.resolve({
        architecture: 'arm',
        bitness: '64',
        brands: [
          { brand: 'Google Chrome', version: `${CHROME_VERSION}.0.0.0` },
          { brand: 'Chromium', version: `${CHROME_VERSION}.0.0.0` },
          { brand: 'Not_A Brand', version: '24.0.0.0' },
        ],
        fullVersionList: [
          { brand: 'Google Chrome', version: `${CHROME_VERSION}.0.0.0` },
          { brand: 'Chromium', version: `${CHROME_VERSION}.0.0.0` },
          { brand: 'Not_A Brand', version: '24.0.0.0' },
        ],
        mobile: false,
        model: '',
        platform: 'macOS',
        platformVersion: '15.3.0',
        uaFullVersion: `${CHROME_VERSION}.0.0.0`,
        wow64: false,
      });
    },
    toJSON() {
      return {
        brands: this.brands,
        mobile: this.mobile,
        platform: this.platform,
      };
    },
  }),
  configurable: false,
});

// Ensure window.chrome exists and looks real
if (!window.chrome) {
  window.chrome = {};
}
if (!window.chrome.runtime) {
  window.chrome.runtime = {
    connect: () => {},
    sendMessage: () => {},
  };
}

// Ensure navigator.webdriver is false
Object.defineProperty(navigator, 'webdriver', {
  get: () => false,
  configurable: false,
});

// Override navigator.plugins to look populated (real Chrome has plugins)
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const plugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer' },
    ];
    plugins.refresh = () => {};
    return plugins;
  },
  configurable: false,
});

// Override navigator.languages
Object.defineProperty(navigator, 'languages', {
  get: () => ['en-US', 'en'],
  configurable: false,
});
