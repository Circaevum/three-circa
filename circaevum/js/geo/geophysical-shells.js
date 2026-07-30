/**
 * Unified toggle for Earth geophysical globe shells (atmosphere, ionosphere, magnetosphere).
 * Scene toolbar icon + keyboard (G); legend panels stay informational only.
 */
(function (global) {
  const STORAGE_KEY = 'circaevum-geophysical-shells-visible.v2';
  let override = null;

  function readStored() {
    try {
      const ls = global.localStorage;
      if (!ls) return false;
      const v = ls.getItem(STORAGE_KEY);
      if (v === '0' || v === 'false') return false;
      if (v === '1' || v === 'true') return true;
      // Fresh / unset → off (atmosphere, ionosphere, magnetosphere).
    } catch (e) { /* ignore */ }
    return false;
  }

  function areGeophysicalShellsEnabled() {
    if (override !== null) return !!override;
    return readStored();
  }

  function setGeophysicalShellsVisible(on) {
    override = !!on;
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch (e) { /* ignore */ }
    if (typeof global.refreshGeophysicalShells === 'function') global.refreshGeophysicalShells();
    syncGeophysicalShellsIcon();
  }

  function toggleGeophysicalShells() {
    setGeophysicalShellsVisible(!areGeophysicalShellsEnabled());
  }

  function syncGeophysicalShellsIcon() {
    const btn = global.document && global.document.getElementById('geophysical-shells-toggle');
    if (!btn) return;
    const on = areGeophysicalShellsEnabled();
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on
      ? 'Geophysical shells: atmosphere, ionosphere, magnetosphere (G)'
      : 'Geophysical shells: hidden (G)';
    btn.setAttribute(
      'aria-label',
      on
        ? 'Hide atmosphere, ionosphere, Van Allen belts, and magnetosphere shells (G)'
        : 'Show atmosphere, ionosphere, Van Allen belts, and magnetosphere shells (G)'
    );
  }

  global.getGeophysicalShellsVisible = areGeophysicalShellsEnabled;
  global.setGeophysicalShellsVisible = setGeophysicalShellsVisible;
  global.toggleGeophysicalShells = toggleGeophysicalShells;
  global.syncGeophysicalShellsIcon = syncGeophysicalShellsIcon;

  global.GeophysicalShells = {
    areGeophysicalShellsEnabled,
    setGeophysicalShellsVisible,
    toggleGeophysicalShells,
    syncGeophysicalShellsIcon,
  };
})(typeof window !== 'undefined' ? window : globalThis);
