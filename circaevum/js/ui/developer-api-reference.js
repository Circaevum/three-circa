(() => {
  const status = document.getElementById('api-reference-status');
  const fallback = document.getElementById('docs-fallback');
  const dialog = document.getElementById('account-dialog');
  const connect = document.getElementById('api-connect-button');
  if (!window.Scalar?.createApiReference) {
    status.textContent = 'Scalar could not load. The OpenAPI document is available above.';
    return;
  }

  const local = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '8080';
  const portal = new URL(local ? '/.local-yin-portal/' : 'https://app.circaevum.com/', location.origin);
  const accountUrl = new URL('?view=account', portal);
  document.getElementById('api-account-link').href = accountUrl;
  document.getElementById('account-full-link').href = accountUrl;
  const spec = new URL('docs/garmin-openapi.json?v=agent-discovery', location.href);
  const connectPath = '/api/account/connect';
  const operations = new Set([connectPath, '/api/garmin/metadata', '/api/account/events', '/api/account/work-tasks', '/api/account/calendar-layout', '/api/garmin/storage', '/api/garmin/journal', '/api/garmin/backfill/status', '/api/garmin/backfill']);
  let bridge;
  let bridgeReady;

  function openBridge() {
    if (bridgeReady) return bridgeReady;
    bridge = document.createElement('iframe');
    bridge.title = 'Circaevum account API connection';
    bridge.src = new URL('?view=garmin-api-bridge', portal);
    bridgeReady = new Promise((resolve, reject) => {
      const onReady = event => {
        if (event.origin !== portal.origin || event.source !== bridge.contentWindow ||
            event.data?.type !== 'CIRCAEVUM_GARMIN_DOCS_READY') return;
        clearTimeout(timeout);
        window.removeEventListener('message', onReady);
        resolve(event.source);
      };
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onReady);
        bridge.remove();
        bridgeReady = undefined;
        reject(new Error('Circaevum account connection did not load.'));
      }, 12000);
      window.addEventListener('message', onReady);
    });
    document.getElementById('account-frame').append(bridge);
    return bridgeReady;
  }

  function jsonResponse(statusCode, body) {
    return new Response(JSON.stringify(body), { status: statusCode, headers: { 'Content-Type': 'application/json' } });
  }

  async function request(input, init) {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.href === spec.href && req.method === 'GET') return fetch(req);
    if (url.origin !== location.origin || url.search || !operations.has(url.pathname) || req.method !== 'POST') {
      return jsonResponse(403, { error: 'This operation is unavailable in the browser reference.' });
    }

    let parameters;
    try {
      const body = await req.text();
      if (body.length > 4096) return jsonResponse(400, { error: 'Request body is too large.' });
      parameters = body ? JSON.parse(body) : {};
    } catch {
      return jsonResponse(400, { error: 'Use a JSON request body.' });
    }

    try {
      const frame = await openBridge();
      return await new Promise(resolve => {
        const { port1, port2 } = new MessageChannel();
        const timeout = setTimeout(() => {
          port1.close();
          resolve(jsonResponse(504, { error: 'The account connection did not respond. Reload the docs after signing in.' }));
        }, 35000);
        port1.onmessage = ({ data }) => {
          clearTimeout(timeout);
          port1.close();
          if (url.pathname === connectPath) {
            if (data.status === 401 && !dialog.open) dialog.showModal();
            if (data.status === 200 && dialog.open) dialog.close();
            status.textContent = data.status === 200 ? 'Connected to Nakama' : data.body.error;
          }
          resolve(jsonResponse(data.status, data.body));
        };
        frame.postMessage({ type: 'CIRCAEVUM_GARMIN_DOCS_REQUEST', operation: url.pathname, parameters }, portal.origin, [port2]);
      });
    } catch (error) {
      return jsonResponse(503, { error: error.message });
    }
  }

  window.Scalar.createApiReference('#scalar-api-reference', {
    url: spec.href,
    layout: 'modern',
    showSidebar: true,
    defaultOpenAllTags: true,
    hideModels: true,
    hiddenClients: true,
    showDeveloperTools: 'never',
    persistAuth: false,
    customFetch: request,
    servers: [{ url: location.origin, description: 'Circaevum browser reference' }],
  });
  fallback.hidden = true;
  connect.hidden = false;
  async function checkConnection() {
    connect.disabled = true;
    status.textContent = 'Checking Nakama session…';
    try {
      const response = await request(new URL(connectPath, location.origin), { method: 'POST' });
      const result = await response.json();
      status.textContent = response.ok ? 'Connected to Nakama' : result.error;
    } finally {
      connect.disabled = false;
    }
  }
  connect.addEventListener('click', checkConnection);
  window.addEventListener('message', event => {
    if (event.origin !== portal.origin || event.source !== bridge?.contentWindow ||
        event.data?.type !== 'CIRCAEVUM_DOCS_SIGNED_IN' || !dialog.open) return;
    void checkConnection();
  });
})();
