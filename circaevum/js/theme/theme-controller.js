/**
 * Circaevum Theme Controller
 * Manages appearance theme state ('light' | 'dark' | 'sky'), background colors,
 * DOM body class synchronization, and parent iframe theme notifications.
 */
(function (global) {
  'use strict';

  let appearanceTheme = 'dark';
  let isLightMode = false;

  function getBackgroundColor(viewMode, appearance) {
    const theme = appearance || appearanceTheme;
    const vm = Math.abs((typeof viewMode === 'number' ? viewMode : 0)) % 3;
    if (theme === 'sky') {
      return [0xa8d4f0, 0xbfe4f8, 0x9ec9eb][vm];
    }
    if (theme === 'light') {
      return [0xe8f4f8, 0xf8e8e8, 0xe8e8f8][vm];
    }
    return [0x000814, 0x140808, 0x080814][vm];
  }

  function refreshThemeToggleButton() {
    if (typeof document === 'undefined') return;
    const button = document.getElementById('light-mode-toggle');
    if (!button) return;
    button.classList.toggle('active', appearanceTheme !== 'dark');
    if (typeof global.setButtonPressed === 'function') {
      global.setButtonPressed(button, appearanceTheme !== 'dark');
    } else {
      button.setAttribute('aria-pressed', String(appearanceTheme !== 'dark'));
    }
    const titles = {
      dark: 'Theme: dark (L)',
      light: 'Theme: light (L)',
      sky: 'Theme: sky blue (L)'
    };
    button.title = `${titles[appearanceTheme] || titles.dark} — cycle`;
    button.setAttribute(
      'aria-label',
      `Cycle appearance: dark, light, sky (currently ${appearanceTheme})`
    );
  }

  function syncAppearanceDerivedState() {
    isLightMode = appearanceTheme === 'light' || appearanceTheme === 'sky';
    if (typeof global.isLightMode !== 'undefined') global.isLightMode = isLightMode;
    if (typeof global.appearanceTheme !== 'undefined') global.appearanceTheme = appearanceTheme;

    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('light-mode', appearanceTheme !== 'dark');
      document.body.classList.toggle('sky-theme', appearanceTheme === 'sky');
    }
    refreshThemeToggleButton();
  }

  function cycleAppearanceTheme() {
    const order = ['dark', 'light', 'sky'];
    const i = Math.max(0, order.indexOf(appearanceTheme));
    appearanceTheme = order[(i + 1) % order.length];
    syncAppearanceDerivedState();

    if (typeof window !== 'undefined' && window.parent !== window.self && window.parent.postMessage) {
      try {
        window.parent.postMessage(
          { type: 'CIRCAEVUM_THEME', lightMode: isLightMode, appearanceTheme },
          '*'
        );
      } catch (e) { /* ignore */ }
    }

    if (typeof global.scene !== 'undefined' && global.scene && typeof global.THREE !== 'undefined') {
      const vm = typeof global.viewMode === 'number' ? global.viewMode : 0;
      global.scene.background = new global.THREE.Color(getBackgroundColor(vm, appearanceTheme));
    }
    if (typeof global.createStarField === 'function') global.createStarField();
    if (typeof global.createPlanets === 'function' && typeof global.currentZoom === 'number') {
      global.createPlanets(global.currentZoom);
    }
  }

  function toggleLightMode() {
    cycleAppearanceTheme();
  }

  function getTheme() {
    return appearanceTheme;
  }

  function setTheme(theme) {
    if (theme === 'dark' || theme === 'light' || theme === 'sky') {
      appearanceTheme = theme;
      syncAppearanceDerivedState();
    }
  }

  const ThemeController = {
    getBackgroundColor,
    refreshThemeToggleButton,
    syncAppearanceDerivedState,
    cycleAppearanceTheme,
    toggleLightMode,
    getTheme,
    setTheme,
    get isLightMode() { return isLightMode; },
    get appearanceTheme() { return appearanceTheme; }
  };

  global.ThemeController = ThemeController;
  global.getBackgroundColor = getBackgroundColor;
  global.refreshThemeToggleButton = refreshThemeToggleButton;
  global.syncAppearanceDerivedState = syncAppearanceDerivedState;
  global.cycleAppearanceTheme = cycleAppearanceTheme;
  global.toggleLightMode = toggleLightMode;

})(typeof window !== 'undefined' ? window : globalThis);
