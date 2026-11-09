/* Work Mode tasks. Three fixed categories. Same ISO timestamps as the rest of Circaevum. */
(function (root) {
  const CATEGORIES = [
    { id: 'research', label: 'Research' },
    { id: 'development', label: 'Development' },
    { id: 'delivery', label: 'Delivery' },
  ];
  const STATUSES = ['pending', 'active', 'blocked', 'completed'];
  const BUDGETS = [15, 30, 60, null];

  function iso(ms) { return new Date(ms).toISOString(); }
  function stamp(value) {
    const t = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  function text(value, max) { return String(value || '').trim().slice(0, max); }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const category = CATEGORIES.some(c => c.id === raw.category) ? raw.category : null;
    const title = text(raw.title, 200);
    if (!category || !title) return null;
    const createdAt = stamp(raw.createdAt) || iso(0);
    const status = STATUSES.includes(raw.status) ? raw.status : 'pending';
    const priority = [1, 2, 3].includes(Number(raw.priority)) ? Number(raw.priority) : 2;
    const estimate = Number(raw.estimateMinutes);
    return {
      id: text(raw.id, 80) || 'task',
      title,
      description: text(raw.description, 2000),
      category,
      project: text(raw.project, 160) || 'Work',
      goal: text(raw.goal, 200),
      status,
      priority,
      estimateMinutes: Number.isFinite(estimate) && estimate > 0 ? Math.round(estimate) : null,
      createdAt,
      updatedAt: stamp(raw.updatedAt) || createdAt,
      completedAt: status === 'completed' ? (stamp(raw.completedAt) || stamp(raw.updatedAt) || createdAt) : null,
      due: stamp(raw.due),
      blocker: text(raw.blocker, 300),
      dependencyId: text(raw.dependencyId, 80),
      criteria: text(raw.criteria, 300),
      resource: text(raw.resource, 500),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
      nextOverride: raw.nextOverride === true,
    };
  }

  function dependencyOpen(task, tasks) {
    if (!task.dependencyId) return '';
    const dep = tasks.find(t => t.id === task.dependencyId);
    if (!dep) return 'Missing dependency';
    if (dep.status !== 'completed') return dep.title;
    return '';
  }

  function blockerText(task, tasks) {
    if (task.status === 'completed') return '';
    if (task.status === 'blocked') return task.blocker || dependencyOpen(task, tasks) || 'Blocked';
    return dependencyOpen(task, tasks);
  }

  function actionable(task, tasks) {
    return task.status !== 'completed' && task.status !== 'blocked' && !dependencyOpen(task, tasks);
  }

  function withinTime(task, budget) {
    if (budget == null) return true;
    if (task.estimateMinutes == null) return true;
    return task.estimateMinutes <= budget;
  }

  function rank(tasks, category, budget) {
    return tasks
      .filter(t => t.category === category && t.status !== 'completed' && withinTime(t, budget))
      .slice()
      .sort((a, b) => {
        const keys = task => [
          task.nextOverride ? 0 : 1,
          actionable(task, tasks) ? 0 : 1,
          task.status === 'active' ? 0 : 1,
          task.goal ? 0 : 1,
          task.priority,
          task.due ? Date.parse(task.due) : 9e15,
          task.estimateMinutes == null ? 1e9 : task.estimateMinutes,
          task.order,
          task.createdAt,
        ];
        const ka = keys(a), kb = keys(b);
        for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        return 0;
      });
  }

  function nextTask(tasks, category, budget) {
    return rank(tasks, category, budget).find(t => actionable(t, tasks)) || null;
  }

  function why(task, tasks) {
    if (!task) return '';
    if (task.nextOverride) return 'You set this as next';
    const bits = [];
    if (actionable(task, tasks)) bits.push(task.status === 'active' ? 'Already active' : 'Actionable');
    if (task.goal) bits.push('Goal: ' + task.goal);
    bits.push(task.priority === 1 ? 'High priority' : task.priority === 3 ? 'Low priority' : 'Normal priority');
    if (task.due) bits.push('Due ' + task.due.slice(0, 10));
    if (task.estimateMinutes) bits.push(task.estimateMinutes + ' min');
    else bits.push('No estimate');
    return bits.join(' · ');
  }

  function startOfDay(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); return +d; }
  function startOfWeek(now) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    return +d;
  }

  function progress(tasks, now) {
    const done = tasks.filter(t => t.status === 'completed' && t.completedAt);
    const recent = done.slice().sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0] || null;
    return {
      today: done.filter(t => Date.parse(t.completedAt) >= startOfDay(now)).length,
      week: done.filter(t => Date.parse(t.completedAt) >= startOfWeek(now)).length,
      remaining: tasks.filter(t => t.status !== 'completed').length,
      recent,
    };
  }

  function recall(tasks, project) {
    const scoped = project ? tasks.filter(t => t.project === project) : tasks;
    const last = scoped.filter(t => t.status === 'completed' && t.completedAt)
      .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0] || null;
    const next = CATEGORIES.map(c => nextTask(scoped, c.id, null)).find(Boolean) || null;
    const blocked = scoped.find(t => t.status !== 'completed' && blockerText(t, tasks));
    const milestone = scoped.find(t => t.goal && t.status !== 'completed') || null;
    return {
      last, next,
      blocker: blocked ? blockerText(blocked, tasks) : '',
      milestone: milestone ? milestone.goal : '',
    };
  }

  function complete(task, now) {
    const at = iso(now);
    return { ...task, status: 'completed', completedAt: at, updatedAt: at, nextOverride: false };
  }
  function reopen(task, now) {
    return { ...task, status: 'active', completedAt: null, updatedAt: iso(now), nextOverride: false };
  }
  function setNext(tasks, id) {
    const hit = tasks.find(t => t.id === id);
    if (!hit) return tasks;
    return tasks.map(t => t.category === hit.category ? { ...t, nextOverride: t.id === id, updatedAt: t.id === id ? iso(Date.now()) : t.updatedAt } : t);
  }
  function move(tasks, id, dir) {
    const hit = tasks.find(t => t.id === id);
    if (!hit || hit.status === 'completed') return tasks;
    const siblings = tasks.filter(t => t.category === hit.category && t.status !== 'completed').slice().sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    const index = siblings.findIndex(t => t.id === id);
    const swap = siblings[index + dir];
    if (!swap) return tasks;
    return tasks.map(t => t.id === hit.id ? { ...t, order: swap.order } : t.id === swap.id ? { ...t, order: hit.order } : t);
  }

  function seed(now) {
    const at = iso(now);
    const done = iso(now - 86400000);
    const row = (id, title, category, status, extra) => normalize({
      id, title, category, status, project: 'OpenAMI / ISV', priority: 2, estimateMinutes: 60,
      description: 'Illustrative planning example, not a confirmed commitment.',
      createdAt: at, updatedAt: status === 'completed' ? done : at, completedAt: status === 'completed' ? done : null,
      order: 0, ...extra,
    });
    return [
      row('wm-kickoff', 'Write what the pilot must answer', 'research', 'completed', { estimateMinutes: 30, goal: 'Pilot ready', order: 1 }),
      row('wm-scope', 'Compare meter fields we can share', 'research', 'active', { priority: 1, estimateMinutes: 45, goal: 'Pilot ready', order: 2 }),
      row('wm-data', 'Map sample meter data', 'development', 'active', { priority: 1, estimateMinutes: 90, goal: 'Pilot ready', dependencyId: 'wm-scope', order: 1 }),
      row('wm-walk', 'Build pilot walkthrough', 'development', 'blocked', { estimateMinutes: 120, blocker: 'Waiting on sample data', dependencyId: 'wm-data', order: 2 }),
      row('wm-review', 'Draft the feedback agenda', 'delivery', 'pending', { estimateMinutes: 20, goal: 'Pilot ready', order: 1 }),
      row('wm-ready', 'Publish the pilot note', 'delivery', 'pending', { priority: 1, estimateMinutes: 30, goal: 'Pilot ready', dependencyId: 'wm-walk', order: 2 }),
    ].filter(Boolean);
  }

  const api = {
    CATEGORIES, STATUSES, BUDGETS, normalize, actionable, blockerText, withinTime,
    rank, nextTask, why, progress, recall, complete, reopen, setNext, move, seed,
  };
  if (typeof module !== 'undefined') module.exports = api;
  root.WorkMode = api;
})(typeof window !== 'undefined' ? window : globalThis);
