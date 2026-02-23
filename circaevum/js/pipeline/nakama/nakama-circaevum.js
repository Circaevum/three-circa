/**
 * Circaevum web adapter for Nakama (device + user auth, storage).
 * Requires: window.NAKAMA_CONFIG, window.NakamaClient, window.NakamaSession (set by nakama-load.js).
 * Usage: window.NakamaCircaevum.getClient(), .authenticateDevice(), .authenticateEmail(), etc.
 */
(function () {
  var SESSION_AUTH_KEY = 'circaevum-nakama-auth';
  var SESSION_REFRESH_KEY = 'circaevum-nakama-refresh';

  function getConfig() {
    var c = window.NAKAMA_CONFIG;
    if (!c || !c.host || !c.host.trim()) return null;
    return {
      scheme: c.scheme || 'https',
      host: c.host.trim(),
      port: Number(c.port) || (c.scheme === 'https' ? 443 : 7350),
      serverKey: c.serverKey || 'defaultkey'
    };
  }

  var clientInstance = null;

  function getClient() {
    if (!window.NakamaClient) return null;
    var cfg = getConfig();
    if (!cfg) return null;
    if (clientInstance) return clientInstance;
    var useSSL = cfg.scheme === 'https';
    clientInstance = new window.NakamaClient(cfg.serverKey, cfg.host, cfg.port, useSSL);
    return clientInstance;
  }

  function isConfigured() {
    return !!getConfig();
  }

  function getStoredSession() {
    try {
      var auth = localStorage.getItem(SESSION_AUTH_KEY);
      var refresh = localStorage.getItem(SESSION_REFRESH_KEY);
      if (!auth || !refresh || !window.NakamaSession) return null;
      return window.NakamaSession.restore(auth, refresh);
    } catch (e) {
      return null;
    }
  }

  function storeSession(session) {
    try {
      if (!session) return;
      localStorage.setItem(SESSION_AUTH_KEY, session.token);
      localStorage.setItem(SESSION_REFRESH_KEY, session.refresh_token);
    } catch (e) {}
  }

  function clearStoredSession() {
    try {
      localStorage.removeItem(SESSION_AUTH_KEY);
      localStorage.removeItem(SESSION_REFRESH_KEY);
    } catch (e) {}
  }

  function authenticateDevice(deviceId) {
    var client = getClient();
    if (!client) return Promise.resolve({ session: null, error: 'Nakama not configured' });
    return client.authenticateDevice(deviceId, true)
      .then(function (session) {
        storeSession(session);
        return { session: session, error: null };
      })
      .catch(function (e) {
        return { session: null, error: (e && e.message) ? e.message : String(e) };
      });
  }

  function authenticateEmail(email, password, create, username) {
    var client = getClient();
    if (!client) return Promise.resolve({ session: null, error: 'Nakama not configured' });
    return client.authenticateEmail(email, password, create, username || null)
      .then(function (session) {
        storeSession(session);
        return { session: session, error: null };
      })
      .catch(function (e) {
        return { session: null, error: (e && e.message) ? e.message : String(e) };
      });
  }

  function restoreOrRefreshSession() {
    var stored = getStoredSession();
    if (!stored) return Promise.resolve(null);
    var client = getClient();
    if (!client) return Promise.resolve(null);
    var nowSec = Date.now() / 1000;
    if (stored.isexpired(nowSec + 86400)) {
      return client.sessionRefresh(stored)
        .then(function (refreshed) {
          storeSession(refreshed);
          return refreshed;
        })
        .catch(function () {
          clearStoredSession();
          return null;
        });
    }
    return Promise.resolve(stored);
  }

  function listStorageObjects(session, collection, userId, limit, cursor) {
    if (!session) return Promise.resolve({ objects: [], cursor: null, error: 'No session' });
    var client = getClient();
    if (!client) return Promise.resolve({ objects: [], cursor: null, error: 'Nakama not configured' });
    var uid = userId || session.user_id;
    return client.listStorageObjects(session, collection, uid, limit || 100, cursor || null)
      .then(function (result) {
        return {
          objects: (result && result.objects) ? result.objects : [],
          cursor: (result && result.cursor) ? result.cursor : null,
          error: null
        };
      })
      .catch(function (e) {
        return { objects: [], cursor: null, error: (e && e.message) ? e.message : String(e) };
      });
  }

  function writeStorageObjects(session, objects) {
    if (!session) return Promise.resolve({ error: 'No session' });
    var client = getClient();
    if (!client) return Promise.resolve({ error: 'Nakama not configured' });
    return client.writeStorageObjects(session, objects)
      .then(function () { return { error: null }; })
      .catch(function (e) { return { error: (e && e.message) ? e.message : String(e) }; });
  }

  window.NakamaCircaevum = {
    isConfigured: isConfigured,
    getClient: getClient,
    getConfig: getConfig,
    authenticateDevice: authenticateDevice,
    authenticateEmail: authenticateEmail,
    getStoredSession: getStoredSession,
    storeSession: storeSession,
    clearStoredSession: clearStoredSession,
    restoreOrRefreshSession: restoreOrRefreshSession,
    listStorageObjects: listStorageObjects,
    writeStorageObjects: writeStorageObjects
  };
})();
