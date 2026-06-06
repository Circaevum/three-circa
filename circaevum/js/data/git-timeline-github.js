/**
 * Git timeline via public GitHub REST API (browser-safe, CORS *).
 * Maps CIR monorepo paths → upstream GitHub repos.
 */
(function (global) {
  var ONE_DAY_SEC = 86400;
  var MAX_COMMITS = 400;
  var MAX_BRANCHES = 24;

  /** Monorepo folder path → GitHub repo (from git remote). */
  var GITHUB_REPOS_BY_PATH = {
    'yang/web': { owner: 'Circaevum', repo: 'three-circa' },
    'yang/yin-portal': { owner: 'EarthAdam', repo: 'yin-portal' },
    'yang/spec': { owner: 'Circaevum', repo: 'circaevum-spec' },
    'yang/unity/TimeBox': { owner: 'Circaevum', repo: 'TimeBox' },
    Zhong: { owner: 'Circaevum', repo: 'zhong' },
    cookbook: { owner: 'cursor', repo: 'cookbook' }
  };

  function githubToken() {
    if (typeof global.CIRCAEVUM_GITHUB_TOKEN === 'string' && global.CIRCAEVUM_GITHUB_TOKEN) {
      return global.CIRCAEVUM_GITHUB_TOKEN;
    }
    return '';
  }

  function githubRepoUrl(owner, repo) {
    return 'https://github.com/' + owner + '/' + repo;
  }

  function commitUrl(owner, repo, sha) {
    return githubRepoUrl(owner, repo) + '/commit/' + sha;
  }

  function parseGitHubRepoInput(input) {
    var s = String(input || '').trim();
    if (!s) return null;

    var urlMatch = s.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i);
    if (urlMatch) {
      return {
        owner: urlMatch[1],
        repo: urlMatch[2].replace(/\.git$/i, ''),
        repoPath: s
      };
    }

    var slugMatch = s.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (slugMatch) {
      return { owner: slugMatch[1], repo: slugMatch[2], repoPath: s };
    }

    var preset = GITHUB_REPOS_BY_PATH[s];
    if (preset) {
      return {
        owner: preset.owner,
        repo: preset.repo,
        repoPath: s
      };
    }

    return null;
  }

  function parseCommitDate(commitObj) {
    if (!commitObj || !commitObj.commit) return 0;
    var d =
      commitObj.commit.committer && commitObj.commit.committer.date
        ? commitObj.commit.committer.date
        : commitObj.commit.author && commitObj.commit.author.date
          ? commitObj.commit.author.date
          : '';
    if (!d) return 0;
    return Math.floor(new Date(d).getTime() / 1000);
  }

  function ghFetch(apiPath) {
    var headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    var token = githubToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch('https://api.github.com' + apiPath, { headers: headers }).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) {
          var msg =
            (body && body.message) ||
            (body && body.error) ||
            r.statusText ||
            'GitHub API error';
          throw new Error(msg);
        }
        return body;
      });
    });
  }

  function fetchCommitPage(owner, repo, page) {
    return ghFetch(
      '/repos/' +
        encodeURIComponent(owner) +
        '/' +
        encodeURIComponent(repo) +
        '/commits?per_page=100&page=' +
        page
    );
  }

  function fetchTipCommit(owner, repo, ref) {
    return ghFetch(
      '/repos/' +
        encodeURIComponent(owner) +
        '/' +
        encodeURIComponent(repo) +
        '/commits?sha=' +
        encodeURIComponent(ref) +
        '&per_page=1'
    );
  }

  function fetchBranchSpan(owner, repo, defaultBranch, branchName, tipSec) {
    if (branchName === defaultBranch) {
      return Promise.resolve({ startSec: tipSec, tipSec: tipSec });
    }
    var comparePath =
      '/repos/' +
      encodeURIComponent(owner) +
      '/' +
      encodeURIComponent(repo) +
      '/compare/' +
      encodeURIComponent(defaultBranch) +
      '...' +
      encodeURIComponent(branchName);
    return ghFetch(comparePath)
      .then(function (cmp) {
        var startSec = tipSec;
        if (cmp.merge_base_commit) {
          startSec = parseCommitDate(cmp.merge_base_commit) || startSec;
        } else if (Array.isArray(cmp.commits) && cmp.commits.length) {
          startSec = parseCommitDate(cmp.commits[0]) || startSec;
        }
        if (startSec > tipSec) startSec = tipSec;
        return { startSec: startSec, tipSec: tipSec };
      })
      .catch(function () {
        return { startSec: tipSec, tipSec: tipSec };
      });
  }

  function buildBranchEntry(name, tipShort, span) {
    var startSec = span.startSec || span.tipSec || 0;
    var tipSec = span.tipSec || startSec || 0;
    var durationSec = Math.max(0, tipSec - startSec);
    var entry = {
      name: name,
      tipShort: tipShort || '',
      creatorUnix: tipSec,
      startSec: startSec,
      tipSec: tipSec,
      durationSec: durationSec
    };
    if (durationSec < ONE_DAY_SEC) {
      entry.kind = 'marker';
      entry.markerSec = startSec;
    } else {
      entry.kind = 'span';
    }
    return entry;
  }

  /**
   * @param {string} repoPath - preset path, owner/repo, or github.com URL
   * @returns {Promise<object>} same payload shape as /api/git-timeline
   */
  function fetchGitTimelineFromGitHub(repoPath) {
    var gh = parseGitHubRepoInput(repoPath);
    if (!gh) {
      return Promise.reject(new Error('Unknown repo — pick a preset, or enter owner/repo or a github.com URL'));
    }

    var owner = gh.owner;
    var repo = gh.repo;
    var pathLabel = gh.repoPath || owner + '/' + repo;

    return ghFetch('/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo)).then(function (meta) {
      var defaultBranch = meta.default_branch || 'main';

      var commitPromise = (function loadCommits(page, acc) {
        if (page > 4 || acc.length >= MAX_COMMITS) return Promise.resolve(acc);
        return fetchCommitPage(owner, repo, page).then(function (batch) {
          if (!Array.isArray(batch) || !batch.length) return acc;
          batch.forEach(function (c) {
            if (acc.length >= MAX_COMMITS) return;
            var ts = parseCommitDate(c);
            if (!ts || !c.sha) return;
            var subject = (c.commit && c.commit.message ? c.commit.message : '').split('\n')[0];
            acc.push({
              hash: c.sha.slice(0, 12),
              hashFull: c.sha,
              timestamp: ts,
              subject: subject,
              url: commitUrl(owner, repo, c.sha)
            });
          });
          if (batch.length < 100) return acc;
          return loadCommits(page + 1, acc);
        });
      })(1, []);

      var branchPromise = ghFetch(
        '/repos/' +
          encodeURIComponent(owner) +
          '/' +
          encodeURIComponent(repo) +
          '/branches?per_page=' +
          MAX_BRANCHES
      ).then(function (branchList) {
        if (!Array.isArray(branchList)) return [];
        var oldestMainSec =
          commitPromise.then(function (commits) {
            return commits.length ? commits[commits.length - 1].timestamp : 0;
          });

        return Promise.all(
          branchList.slice(0, MAX_BRANCHES).map(function (b) {
            var name = b.name || '';
            var tipShort = b.commit && b.commit.sha ? b.commit.sha.slice(0, 7) : '';
            return fetchTipCommit(owner, repo, name).then(function (tipBatch) {
              var tipSec =
                Array.isArray(tipBatch) && tipBatch.length ? parseCommitDate(tipBatch[0]) : 0;
              if (!tipSec) return buildBranchEntry(name, tipShort, { startSec: tipSec, tipSec: tipSec });
              if (name === defaultBranch) {
                return oldestMainSec.then(function (oldest) {
                  var startSec = oldest || tipSec;
                  return buildBranchEntry(name, tipShort, { startSec: startSec, tipSec: tipSec });
                });
              }
              return fetchBranchSpan(owner, repo, defaultBranch, name, tipSec).then(function (span) {
                return buildBranchEntry(name, tipShort, span);
              });
            });
          })
        );
      });

      return Promise.all([commitPromise, branchPromise]).then(function (parts) {
        var commits = parts[0] || [];
        var branches = parts[1] || [];
        return {
          gitRoot: githubRepoUrl(owner, repo),
          repoPath: pathLabel,
          defaultBranch: defaultBranch,
          commits: commits,
          branches: branches,
          collectedAt: new Date().toISOString(),
          source: 'github'
        };
      });
    });
  }

  global.GITHUB_REPOS_BY_PATH = GITHUB_REPOS_BY_PATH;
  global.parseGitHubRepoInput = parseGitHubRepoInput;
  global.fetchGitTimelineFromGitHub = fetchGitTimelineFromGitHub;
})(typeof window !== 'undefined' ? window : global);
