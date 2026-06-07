/**
 * Git timeline layer (like Edge Esmeralda): GitHub API, local git API, or bundled snapshots.
 * Commits → STE (1h spans). Branches ≥1 day → LTE; shorter → noon day marker.
 */
(function (global) {
  var LAYER_ID = 'git-timeline';
  var LAYER_NAME = 'Git';
  var COMMIT_STE_MS = 3600000;
  var BRANCH_MARKER_MS = 3600000;
  var ONE_DAY_MS = 86400000;
  var BRANCH_COLORS = ['#58a6ff', '#3fb950', '#d2a8ff', '#f0883e', '#ff7b72', '#79c0ff', '#56d364', '#e3b341'];
  var GIT_REPO_STORAGE_KEY = 'circaevum_git_repo_path';
  var DEFAULT_PUBLIC_GL_ORIGIN = 'https://circaevum.com';
  var DEFAULT_LOCAL_API_BASES = ['http://localhost:5174', 'http://localhost:5175'];
  var DEFAULT_PRESET_PATH = 'yang/web';

  /** Circaevum product repos — preset path maps to GitHub in git-timeline-github.js */
  var GIT_TIMELINE_REPO_PRESETS = [
    { path: 'yang/web', label: 'GL', title: 'Circaevum/three-circa (GL)' },
    { path: 'yang/yin-portal', label: 'Yin-portal', title: 'EarthAdam/yin-portal' },
    { path: 'yang/spec', label: 'Nakama spec', title: 'Circaevum/circaevum-spec' },
    { path: 'yang/unity/TimeBox', label: 'Unity', title: 'Circaevum/TimeBox' },
    { path: 'Zhong', label: 'Zhong', title: 'Circaevum/zhong' },
    { path: 'cookbook', label: 'Cookbook', title: 'cursor/cookbook' }
  ];

  function isoDateTime(ms) {
    return { dateTime: new Date(ms).toISOString(), timeZone: 'UTC' };
  }

  function noonUtcOnDay(epochMs) {
    var d = new Date(epochMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0);
  }

  function branchColor(name, idx) {
    var h = 0;
    var s = String(name || '');
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return BRANCH_COLORS[(Math.abs(h) + idx) % BRANCH_COLORS.length];
  }

  function buildLayerStyles(extra) {
    var meshStyle = { plotType: 'auto' };
    return Object.assign(
      {
        'Git Commit': Object.assign({ color: '#8b949e' }, meshStyle),
        'Git Branch': Object.assign({ color: '#58a6ff' }, meshStyle)
      },
      extra || {}
    );
  }

  function buildCommitVevents(commits) {
    if (!Array.isArray(commits)) return [];
    return commits.map(function (c) {
      var startMs = (c.timestamp || 0) * 1000;
      if (!startMs) return null;
      var hash = c.hashFull || c.hash || '';
      return {
        uid: 'git-commit-' + (hash || startMs),
        dtstart: isoDateTime(startMs),
        dtend: isoDateTime(startMs + COMMIT_STE_MS),
        summary: (c.subject || hash || 'commit').slice(0, 96),
        description:
          (hash ? hash + '\n' : '') +
          (c.subject || '') +
          (c.url ? '\n' + c.url : ''),
        categories: ['Git Commit'],
        color: '#8b949e'
      };
    }).filter(Boolean);
  }

  function buildBranchVevents(branches) {
    if (!Array.isArray(branches)) return [];
    return branches.map(function (b, idx) {
      var color = branchColor(b.name, idx);
      var name = b.name || 'branch';
      if (b.kind === 'marker' || (b.durationSec != null && b.durationSec * 1000 < ONE_DAY_MS)) {
        var markerSec = b.markerSec != null ? b.markerSec : b.startSec;
        var markerMs = noonUtcOnDay((markerSec || b.tipSec || 0) * 1000);
        return {
          uid: 'git-branch-marker-' + name,
          dtstart: isoDateTime(markerMs),
          dtend: isoDateTime(markerMs + BRANCH_MARKER_MS),
          summary: 'branch: ' + name,
          description: 'Branch active < 1 day (day marker)',
          categories: ['Git Branch'],
          color: color
        };
      }
      var startMs = (b.startSec || 0) * 1000;
      var endMs = (b.tipSec || b.startSec || 0) * 1000;
      if (endMs <= startMs) endMs = startMs + ONE_DAY_MS;
      return {
        uid: 'git-branch-' + name,
        dtstart: isoDateTime(startMs),
        dtend: isoDateTime(endMs),
        summary: 'branch: ' + name,
        description: 'Branch span (LTE)',
        categories: ['Git Branch'],
        color: color
      };
    }).filter(Boolean);
  }

  function publicGlOrigin() {
    if (typeof global.CIRCAEVUM_PUBLIC_GL_ORIGIN === 'string' && global.CIRCAEVUM_PUBLIC_GL_ORIGIN) {
      return global.CIRCAEVUM_PUBLIC_GL_ORIGIN.replace(/\/$/, '');
    }
    return DEFAULT_PUBLIC_GL_ORIGIN;
  }

  function repoPathToSlug(repoPath) {
    var p = String(repoPath || '').trim();
    return p ? p.replace(/\//g, '-') : 'root';
  }

  function snapshotPath(repoPath) {
    return 'circaevum/data/git-timeline/' + repoPathToSlug(repoPath) + '.json';
  }

  function snapshotUrlsToTry(repoPath) {
    var path = snapshotPath(repoPath);
    var out = [];
    function add(url) {
      var u = String(url || '').replace(/\/$/, '');
      if (u && out.indexOf(u) < 0) out.push(u);
    }
    try {
      if (global.location && global.location.origin && global.location.protocol !== 'file:') {
        add(global.location.origin + '/' + path);
      }
    } catch (e) { /* ignore */ }
    add(publicGlOrigin() + '/' + path);
    return out;
  }

  function apiBasesToTry() {
    var out = [];
    if (typeof global.CIRCAEVUM_GIT_API_BASE === 'string' && global.CIRCAEVUM_GIT_API_BASE) {
      out.push(global.CIRCAEVUM_GIT_API_BASE.replace(/\/$/, ''));
    }
    DEFAULT_LOCAL_API_BASES.forEach(function (b) {
      if (out.indexOf(b) < 0) out.push(b);
    });
    return out;
  }

  function fetchGitTimelineSnapshotFromUrl(url) {
    return fetch(url).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error((body && body.error) || r.statusText);
        if (!body || !Array.isArray(body.commits)) throw new Error('Invalid git snapshot');
        return body;
      });
    });
  }

  function fetchGitTimelineFromApi(repoPath, apiBase) {
    var base = String(apiBase || '').replace(/\/$/, '');
    var q = repoPath ? '?repo=' + encodeURIComponent(repoPath) : '';
    return fetch(base + '/api/git-timeline' + q).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error((body && body.error) || r.statusText);
        return body;
      });
    });
  }

  function gitTimelineLoadError(repoPath) {
    return new Error(
      'Git timeline unavailable for "' +
        (repoPath || 'repo') +
        '". Tried GitHub API, local git (:5174/:5175), and snapshots. Use a preset, owner/repo, or github.com URL.'
    );
  }

  function fetchGitTimelineWithFallback(repoPath) {
    var apiBases = apiBasesToTry();
    var snapshotUrls = snapshotUrlsToTry(repoPath);

    function trySnapshots(j) {
      if (j >= snapshotUrls.length) {
        return Promise.reject(gitTimelineLoadError(repoPath));
      }
      return fetchGitTimelineSnapshotFromUrl(snapshotUrls[j]).catch(function () {
        return trySnapshots(j + 1);
      });
    }

    function tryApis(i) {
      if (i >= apiBases.length) return trySnapshots(0);
      return fetchGitTimelineFromApi(repoPath, apiBases[i]).catch(function () {
        return tryApis(i + 1);
      });
    }

    function tryGitHub() {
      if (typeof global.fetchGitTimelineFromGitHub !== 'function') return tryApis(0);
      if (typeof global.parseGitHubRepoInput !== 'function' || !global.parseGitHubRepoInput(repoPath)) {
        return tryApis(0);
      }
      return global.fetchGitTimelineFromGitHub(repoPath).catch(function () {
        return tryApis(0);
      });
    }

    return tryGitHub();
  }

  function getStoredRepoPath() {
    try {
      return localStorage.getItem(GIT_REPO_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setStoredRepoPath(repoPath) {
    try {
      if (repoPath) localStorage.setItem(GIT_REPO_STORAGE_KEY, repoPath);
      else localStorage.removeItem(GIT_REPO_STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  /**
   * Ingest git payload into one calendar layer (portal postMessage / Zhong popup).
   */
  function ingestGitTimeline(payload, options) {
    options = options || {};
    var gl = global.circaevumGL || (global.getGL && global.getGL());
    if (!gl || typeof gl.ingestEvents !== 'function') {
      console.warn('[git-timeline] GL not ready');
      return { commits: 0, branches: 0, total: 0 };
    }
    var layerId = options.layerId || LAYER_ID;
    var vevents = buildCommitVevents(payload && payload.commits).concat(
      buildBranchVevents(payload && payload.branches)
    );
    var mergedStyles = buildLayerStyles({});

    var layer = gl.getLayer && gl.getLayer(layerId);
    if (!layer && typeof gl.addLayer === 'function') {
      gl.addLayer(layerId, {
        name: LAYER_NAME,
        plotType: 'polygon3d',
        opacity: 0.9,
        visible: true
      });
    } else if (layer) {
      layer.name = LAYER_NAME;
      layer.visible = true;
    }

    gl.ingestEvents(layerId, vevents, {
      sessionId: options.sessionId || 'git-timeline',
      layerStyles: mergedStyles,
      timelineEventFilter: 'all'
    });

    if (typeof gl.setLayerVisibility === 'function') gl.setLayerVisibility(layerId, true);
    var edgeLayerId = typeof global.edgeEsmeralda2026LayerId === 'string' ? global.edgeEsmeralda2026LayerId : 'edge-esmeralda-2026';
    if (layerId !== edgeLayerId && gl.getLayer && gl.getLayer(edgeLayerId) && typeof gl.setLayerVisibility === 'function') {
      gl.setLayerVisibility(edgeLayerId, false);
    }
    if (typeof global.circaevumSelectedLayerId !== 'undefined') {
      global.circaevumSelectedLayerId = layerId;
    }
    if (typeof global.refreshCalendarLayersList === 'function') global.refreshCalendarLayersList();
    if (typeof global.refreshEventsList === 'function') global.refreshEventsList(false);
    if (typeof global.openEventListPanel === 'function' && options.openEventList) {
      global.openEventListPanel();
    }
    return { commits: (payload && payload.commits && payload.commits.length) || 0, branches: (payload && payload.branches && payload.branches.length) || 0, total: vevents.length };
  }

  /**
   * Load git from API and show as a calendar layer (Edge Esmeralda pattern).
   * @param {string} [repoPath] - e.g. yang/web (empty = workspace root git)
   * @param {{ navigateTo?: Date, zoomLevel?: number }} [opts]
   * @returns {Promise<number>} event count
   */
  function loadGitTimeline(repoPath, opts) {
    opts = opts || {};
    var gl = typeof global.getGL === 'function' ? global.getGL() : null;
    if (!gl || typeof gl.ingestEvents !== 'function') {
      console.warn('[git-timeline] CircaevumGL not ready');
      return Promise.resolve(0);
    }

    var repo = repoPath != null ? String(repoPath).trim() : getStoredRepoPath();
    setStoredRepoPath(repo);

    return fetchGitTimelineWithFallback(repo).then(function (payload) {
      var counts = ingestGitTimeline(payload, { openEventList: !!opts.openEventList });
      var n = counts.total || 0;

      if (payload && payload.commits && payload.commits.length) {
        var tip = payload.commits[0];
        var anchorMs = (tip.timestamp || 0) * 1000;
        var anchor =
          opts.navigateTo instanceof Date && !isNaN(opts.navigateTo.getTime())
            ? opts.navigateTo
            : anchorMs
              ? new Date(anchorMs)
              : null;
        var zoom = opts.zoomLevel != null ? opts.zoomLevel : 3;
        if (anchor) {
          var applyZoom = typeof global.setZoomLevel === 'function' ? global.setZoomLevel : null;
          if (applyZoom) applyZoom(zoom, anchor);
          else {
            if (typeof gl.setZoomLevel === 'function') gl.setZoomLevel(zoom);
            if (typeof gl.navigateToTime === 'function') gl.navigateToTime(anchor);
          }
          if (typeof global.createPlanets === 'function' && typeof global.currentZoom !== 'undefined') {
            global.createPlanets(global.currentZoom);
          }
        }
      }

      return n;
    });
  }

  function populateGitTimelinePresetSelect(selectEl, inputEl) {
    if (!selectEl) return;
    var stored = getStoredRepoPath();
    selectEl.innerHTML = '';
    var customOpt = document.createElement('option');
    customOpt.value = '';
    customOpt.textContent = 'Custom…';
    selectEl.appendChild(customOpt);
    GIT_TIMELINE_REPO_PRESETS.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.path;
      opt.textContent = p.label;
      if (p.title) opt.title = p.title;
      selectEl.appendChild(opt);
    });
    var matched = GIT_TIMELINE_REPO_PRESETS.some(function (p) {
      return p.path === stored;
    });
    if (matched) {
      selectEl.value = stored;
      if (inputEl) inputEl.value = stored;
    } else if (stored) {
      selectEl.value = '';
      if (inputEl) inputEl.value = stored;
    } else {
      selectEl.value = DEFAULT_PRESET_PATH;
      if (inputEl) inputEl.value = DEFAULT_PRESET_PATH;
    }
  }

  function syncGitTimelinePresetFromInput(selectEl, inputEl) {
    if (!selectEl || !inputEl) return;
    var repo = String(inputEl.value || '').trim();
    var hit = GIT_TIMELINE_REPO_PRESETS.some(function (p) {
      return p.path === repo;
    });
    selectEl.value = hit ? repo : '';
  }

  global.gitTimelineLayerId = LAYER_ID;
  global.GIT_TIMELINE_REPO_PRESETS = GIT_TIMELINE_REPO_PRESETS;
  global.populateGitTimelinePresetSelect = populateGitTimelinePresetSelect;
  global.syncGitTimelinePresetFromInput = syncGitTimelinePresetFromInput;
  global.buildGitCommitVevents = buildCommitVevents;
  global.buildGitBranchVevents = buildBranchVevents;
  global.ingestGitTimeline = ingestGitTimeline;
  global.fetchGitTimelineFromApi = fetchGitTimelineFromApi;
  global.fetchGitTimelineWithFallback = fetchGitTimelineWithFallback;
  global.loadGitTimeline = loadGitTimeline;
  global.getGitTimelineRepoPath = getStoredRepoPath;
  global.setGitTimelineRepoPath = setStoredRepoPath;

  function tryAutoLoadFromQuery() {
    try {
      var params = new URLSearchParams(global.location.search);
      if (params.get('gitTimeline') !== '1' && params.get('git') !== '1') return;
      var repo = params.get('repo') || '';
      var tick = setInterval(function () {
        var gl = global.getGL && global.getGL();
        if (!gl) return;
        clearInterval(tick);
        loadGitTimeline(repo, { openEventList: true }).catch(function (err) {
          console.error('[git-timeline] auto-load failed:', err);
        });
      }, 200);
      setTimeout(function () { clearInterval(tick); }, 15000);
    } catch (e) { /* ignore */ }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', tryAutoLoadFromQuery);
  }
})(typeof window !== 'undefined' ? window : global);
