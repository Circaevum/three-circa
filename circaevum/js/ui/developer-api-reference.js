(() => {
  const status = document.getElementById('api-reference-status');
  if (!window.Scalar?.createApiReference) {
    status.textContent = 'Scalar could not load. The OpenAPI document is available above.';
    return;
  }

  const local = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '8080';
  const portal = new URL(local ? '/.local-yin-portal/' : 'https://app.circaevum.com/', location.origin);
  document.getElementById('api-account-link').href = new URL('?view=account', portal);
  const spec = new URL('docs/garmin-openapi.json', location.href);
  const operations = new Set(['/api/garmin/storage', '/api/garmin/journal', '/api/garmin/backfill/status', '/api/garmin/backfill']);
  let bridge;
  let bridgeReady;

  function openBridge() {
    if (bridgeReady) return bridgeReady;
    bridge = document.createElement('iframe');
    bridge.hidden = true;
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
    document.body.append(bridge);
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
    layout: 'classic',
    defaultOpenAllTags: true,
    hideModels: true,
    hiddenClients: true,
    showDeveloperTools: 'never',
    persistAuth: false,
    customFetch: request,
    servers: [{ url: location.origin, description: 'Circaevum browser reference' }],
  });
  status.textContent = 'Use Test Request to run an operation. Sign in to Circaevum in this browser first.';
})();
