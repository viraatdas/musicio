// Injected into webviews to enable media key control.
// Exposes helper functions the renderer can call via executeJavaScript.

window.__musicioMedia = {
  playPause() {
    // Spotify
    const spotifyBtn = document.querySelector('[data-testid="control-button-playpause"]');
    if (spotifyBtn) { spotifyBtn.click(); return; }

    // YouTube Music
    const ytBtn = document.querySelector('#play-pause-button');
    if (ytBtn) { ytBtn.click(); return; }

    // Fallback: trigger keyboard space
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
  },

  nextTrack() {
    const spotifyBtn = document.querySelector('[data-testid="control-button-skip-forward"]');
    if (spotifyBtn) { spotifyBtn.click(); return; }

    const ytBtn = document.querySelector('.next-button');
    if (ytBtn) { ytBtn.click(); return; }
  },

  prevTrack() {
    const spotifyBtn = document.querySelector('[data-testid="control-button-skip-back"]');
    if (spotifyBtn) { spotifyBtn.click(); return; }

    const ytBtn = document.querySelector('.previous-button');
    if (ytBtn) { ytBtn.click(); return; }
  },
};
