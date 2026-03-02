/**
 * Loads @heroiclabs/nakama-js and exposes Client + Session on window for classic scripts.
 * Load this once via <script type="module" src="...nakama-load.js"></script>.
 */
(function () {
  const ESM_URL = 'https://esm.run/@heroiclabs/nakama-js';
  import(ESM_URL)
    .then(function (mod) {
      window.NakamaClient = mod.Client;
      window.NakamaSession = mod.Session;
      window.nakamaModuleLoaded = true;
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new Event('nakama-loaded'));
      }
    })
    .catch(function (err) {
      console.warn('[Circaevum Nakama] Failed to load nakama-js from ESM:', err);
      window.nakamaModuleLoaded = false;
    });
})();
