/* Explicitly opened Research / Development / Delivery workspace. Does not move the camera. */
(function () {
  const M = window.WorkMode;
  if (!M) return;
  const KEY = 'circaevum.work-mode.v1';
  let tasks = [];
  let savedAt = '';
  let project = '';
  let budget = null;
  let expanded = false;
  let editing = null;
  let applyingRemote = false;

  function load() {
    try {
      const board = JSON.parse(localStorage.getItem(KEY));
      if (board && Array.isArray(board.tasks)) {
        tasks = board.tasks.map(M.normalize).filter(Boolean);
        savedAt = board.savedAt || '';
        project = board.project || '';
        budget = board.budget === 15 || board.budget === 30 || board.budget === 60 ? board.budget : null;
        return;
      }
    } catch (_) {}
    tasks = M.seed(Date.now());
    savedAt = '';
    project = 'OpenAMI / ISV';
  }
  // Legacy dock preferences never reopen UI; retain compatible fields on future saves.
  function board() {
    return { tasks, savedAt, project, budget, dockCollapsed: true, dockLayout: 2, fallback: 'local' };
  }
  function persist() {
    savedAt = new Date().toISOString();
    const payload = board();
    try { localStorage.setItem(KEY, JSON.stringify(payload)); } catch (_) {}
    if (!applyingRemote && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'CIRCAEVUM_SAVE_WORK_BOARD', board: payload }, '*');
    }
  }

  const overlay = document.createElement('section');
  overlay.id = 'work-mode';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Work Mode');
  document.body.append(overlay);

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function scoped() { return project ? tasks.filter(t => t.project === project) : tasks; }
  function projects() { return [...new Set(tasks.map(t => t.project))]; }

  function taskPatch(id, patch) {
    const at = new Date().toISOString();
    tasks = tasks.map(t => t.id === id ? M.normalize({ ...t, ...patch, id: t.id, updatedAt: at }) : t).filter(Boolean);
    persist();
    render();
  }

  function editor(task) {
    const deps = tasks.filter(t => t.id !== task.id).map(t => `<option value="${esc(t.id)}" ${t.id === task.dependencyId ? 'selected' : ''}>${esc(t.title)}</option>`).join('');
    return `<form class="wm-edit" data-id="${esc(task.id)}">
      <label>Title<input name="title" value="${esc(task.title)}" required></label>
      <label>Description<textarea name="description">${esc(task.description)}</textarea></label>
      <label>Project<input name="project" value="${esc(task.project)}" required></label>
      <label>Goal<input name="goal" value="${esc(task.goal)}"></label>
      <label>Status<select name="status">${M.STATUSES.map(s => `<option ${s === task.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Priority<select name="priority"><option value="1" ${task.priority === 1 ? 'selected' : ''}>High</option><option value="2" ${task.priority === 2 ? 'selected' : ''}>Normal</option><option value="3" ${task.priority === 3 ? 'selected' : ''}>Low</option></select></label>
      <label>Minutes<input name="estimateMinutes" type="number" min="1" step="5" value="${task.estimateMinutes || ''}"></label>
      <label>Due<input name="due" type="date" value="${task.due ? task.due.slice(0, 10) : ''}"></label>
      <label>Blocker<input name="blocker" value="${esc(task.blocker)}"></label>
      <label>Depends on<select name="dependencyId"><option value="">None</option>${deps}</select></label>
      <label>Done when<input name="criteria" value="${esc(task.criteria)}"></label>
      <label>Link<input name="resource" value="${esc(task.resource)}" placeholder="File, commit, or URL"></label>
      <div class="wm-edit-actions"><button type="submit">Save</button><button type="button" data-act="cancel-edit">Cancel</button></div>
    </form>`;
  }

  function card(task, primary) {
    if (editing === task.id) return editor(task);
    const block = M.blockerText(task, tasks);
    return `<article class="wm-card ${primary ? 'is-next' : ''}" data-id="${esc(task.id)}">
      <header><strong>${esc(task.title)}</strong><span>${task.estimateMinutes ? task.estimateMinutes + ' min' : 'No estimate'}</span></header>
      ${primary ? `<p class="wm-why">${esc(M.why(task, tasks))}</p>` : ''}
      <p class="wm-meta">${esc(task.project)}${task.goal ? ' · ' + esc(task.goal) : ''}${block ? ' · Blocked: ' + esc(block) : ''}</p>
      ${task.criteria ? `<p class="wm-meta">Done when: ${esc(task.criteria)}</p>` : ''}
      ${task.resource ? `<p class="wm-meta"><a href="${esc(task.resource)}" target="_blank" rel="noreferrer">${esc(task.resource)}</a></p>` : ''}
      <div class="wm-card-actions">
        ${task.status !== 'completed' ? `<button type="button" data-act="done" data-id="${esc(task.id)}">Done</button><button type="button" data-act="next" data-id="${esc(task.id)}">Set as next</button><button type="button" data-act="up" data-id="${esc(task.id)}" aria-label="Move up">↑</button><button type="button" data-act="down" data-id="${esc(task.id)}" aria-label="Move down">↓</button>` : `<button type="button" data-act="reopen" data-id="${esc(task.id)}">Reopen</button><time datetime="${esc(task.completedAt)}">${esc((task.completedAt || '').slice(0, 16).replace('T', ' '))}</time>`}
        <button type="button" data-act="edit" data-id="${esc(task.id)}">Edit</button>
      </div>
    </article>`;
  }

  function column(category) {
    const list = scoped();
    const next = M.nextTask(list, category.id, budget);
    const rest = M.rank(list, category.id, budget).filter(t => !next || t.id !== next.id);
    const done = list.filter(t => t.category === category.id && t.status === 'completed')
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
    return `<section class="wm-col" aria-label="${category.label}">
      <header><h2>${category.label}</h2><span>${rest.length + (next ? 1 : 0)} open</span></header>
      ${next ? card(next, true) : `<p class="wm-empty">${budget == null ? 'No actionable task.' : 'No task fits this time.'}</p>`}
      <div class="wm-list">${rest.map(t => card(t, false)).join('')}</div>
      <form class="wm-quick" data-quick="${category.id}"><input name="title" placeholder="Add ${category.label.toLowerCase()}" required aria-label="New ${category.label} task"><button type="submit">Add</button></form>
      <details class="wm-done"><summary>Completed · ${done.length}</summary>${done.map(t => card(t, false)).join('') || '<p class="wm-empty">None yet.</p>'}</details>
    </section>`;
  }

  function renderOverlay() {
    overlay.hidden = !expanded;
    document.body.classList.toggle('work-mode-open', expanded);
    if (!expanded) return;
    const list = scoped();
    const stats = M.progress(tasks, Date.now());
    const memory = M.recall(list, project);
    const chips = [[15, '15 min'], [30, '30 min'], [60, '60 min'], [null, '120+']].map(([value, label]) =>
      `<button type="button" data-act="budget" data-budget="${value == null ? 'all' : value}" aria-pressed="${budget === value}">${label}</button>`).join('');
    const projectOptions = [`<option value="">All projects</option>`].concat(projects().map(name => `<option value="${esc(name)}" ${name === project ? 'selected' : ''}>${esc(name)}</option>`)).join('');
    overlay.innerHTML = `<div class="wm-sheet">
      <header class="wm-bar">
        <h1 tabindex="-1">Work</h1>
        <label>Project<select data-act="project">${projectOptions}</select></label>
        <div class="wm-budgets" role="group" aria-label="Available time">${chips}</div>
        <p class="wm-progress">Today ${stats.today} · Week ${stats.week} · Left ${stats.remaining}${stats.recent ? ' · Last ' + esc(stats.recent.title) : ''}</p>
        <button type="button" data-act="close" aria-label="Back to the calendar">Calendar</button>
      </header>
      <p class="wm-recall">Last ${esc(memory.last ? memory.last.title : '—')} · Next ${esc(memory.next ? memory.next.title : '—')} · Blocker ${esc(memory.blocker || '—')} · Milestone ${esc(memory.milestone || '—')}</p>
      <div class="wm-cols">${M.CATEGORIES.map(column).join('')}</div>
    </div>`;
    overlay.querySelector('h1')?.focus?.();
  }

  function render() { renderOverlay(); }

  function addTask(title, category, projectName) {
    const at = new Date().toISOString();
    const task = M.normalize({
      id: 'wm-' + crypto.randomUUID(), title, category,
      project: projectName || project || projects()[0] || 'Work',
      status: 'active', priority: 2, estimateMinutes: budget || 30,
      createdAt: at, updatedAt: at, order: Date.now(),
    });
    if (!task) return;
    tasks = tasks.concat(task);
    persist();
    render();
  }

  function onClick(event) {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const act = button.dataset.act;
    const id = button.dataset.id;
    if (act === 'open-mode' || act === 'open') { editing = act === 'open' ? id : editing; expanded = true; render(); return; }
    if (act === 'close') { expanded = false; editing = null; render(); return; }
    if (act === 'budget') { budget = button.dataset.budget === 'all' ? null : Number(button.dataset.budget); persist(); render(); return; }
    if (act === 'edit') { editing = id; expanded = true; render(); return; }
    if (act === 'cancel-edit') { editing = null; render(); return; }
    if (act === 'done') { tasks = tasks.map(t => t.id === id ? M.complete(t, Date.now()) : t); if (editing === id) editing = null; persist(); render(); return; }
    if (act === 'reopen') { tasks = tasks.map(t => t.id === id ? M.reopen(t, Date.now()) : t); persist(); render(); return; }
    if (act === 'next') { tasks = M.setNext(tasks, id); persist(); render(); return; }
    if (act === 'up' || act === 'down') { tasks = M.move(tasks, id, act === 'up' ? -1 : 1); persist(); render(); return; }
  }
  function onSubmit(event) {
    const form = event.target;
    if (form.dataset.quick) {
      event.preventDefault();
      const title = new FormData(form).get('title');
      const category = form.dataset.quick;
      const projectName = project;
      if (String(title || '').trim()) addTask(String(title).trim(), category, projectName || '');
      return;
    }
    if (form.classList.contains('wm-edit')) {
      event.preventDefault();
      const data = new FormData(form);
      const due = data.get('due');
      taskPatch(form.dataset.id, {
        title: data.get('title'), description: data.get('description'), project: data.get('project'), goal: data.get('goal'),
        status: data.get('status'), priority: Number(data.get('priority')),
        estimateMinutes: data.get('estimateMinutes') ? Number(data.get('estimateMinutes')) : null,
        due: due ? new Date(due + 'T12:00:00').toISOString() : null,
        blocker: data.get('blocker'), dependencyId: data.get('dependencyId'), criteria: data.get('criteria'), resource: data.get('resource'),
      });
      editing = null;
      render();
    }
  }
  function onChange(event) {
    if (event.target.dataset.act === 'project') { project = event.target.value; persist(); render(); }
  }

  overlay.addEventListener('click', onClick);
  overlay.addEventListener('submit', onSubmit);
  overlay.addEventListener('change', onChange);
  document.addEventListener('keydown', event => {
    if(window.isSceneKeyboardEditing?.(event))return;
    if (event.key === 'Escape' && expanded) { expanded = false; editing = null; render(); }
  });
  document.querySelector('[data-open-work-mode]')?.addEventListener('click', () => { expanded = true; render(); });
  window.addEventListener('message', event => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'CIRCAEVUM_OPEN_WORK_MODE') { expanded = true; render(); }
    if (data.type === 'CIRCAEVUM_WORK_BOARD' && data.board && Array.isArray(data.board.tasks)) {
      if (savedAt && String(data.board.savedAt || '') <= savedAt) return;
      const incoming = data.board.tasks.map(M.normalize).filter(Boolean);
      applyingRemote = true;
      tasks = incoming;
      project = data.board.project || project;
      budget = data.board.budget === 15 || data.board.budget === 30 || data.board.budget === 60 ? data.board.budget : null;
      savedAt = data.board.savedAt || savedAt;
      try { localStorage.setItem(KEY, JSON.stringify(board())); } catch (_) {}
      applyingRemote = false;
      render();
    }
  });

  load();
  try {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(board()));
  } catch (_) {}
  render();
})();
