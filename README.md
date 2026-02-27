# Musicio

A cyberpunk-themed Mac desktop app that brings Spotify and YouTube Music together in one place. Access your liked songs, playlists, and create cross-platform collections.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron) ![macOS](https://img.shields.io/badge/macOS-universal-000000?logo=apple) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Spotify + YouTube Music** side-by-side with persistent sessions
- **Custom playlists** - create bespoke playlists with songs from both services
- **Cyberpunk UI** - neon glow effects, glitch text animation, scanline overlay, Orbitron font
- **Keyboard shortcuts** - Cmd+1 (Spotify), Cmd+2 (YouTube Music), Cmd+3 (My Playlists)
- **Media key support** - play/pause, next, previous forwarded to the active player
- **Session persistence** - stay logged in across restarts, remembers your last active tab
- **macOS native** - frameless window with native traffic lights

## Install

Download the latest `.dmg` from [Releases](https://github.com/viraatdas/musicio/releases), open it, and drag Musicio to Applications.

> **Note:** Since the app isn't code-signed, macOS may block it on first launch. Right-click the app and select "Open" to bypass Gatekeeper.

## Development

```bash
# Install dependencies
npm install

# Run the app
npm start

# Run with logging
npm run dev

# Build DMG
npm run build:dmg
```

## Tech Stack

- **Electron** - frameless BrowserWindow with webview tags
- **WebView partitions** - separate persistent sessions per service (`persist:spotify`, `persist:youtube`)
- **Chrome UA spoofing** - full web player compatibility
- **CSS** - custom properties, keyframe animations, no framework

## License

MIT
