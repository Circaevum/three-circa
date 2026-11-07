/* Additive VEVENT work metadata; no alternative clock or calendar status. */
(function (root) {
  const DAY = 86400000;
  const statuses = ['planned', 'todo', 'in-progress', 'waiting', 'blocked', 'cancelled', 'done', 'no-outcome'];
  const workflows = { 'ai-code': ['AI-assisted coding', '◈', '74,124,194'], cloud: ['Cloud services', '☁', '141,110,186'], code: ['Code & configuration', '⌘', '69,145,112'], communication: ['Communication & meetings', '◉', '172,151,65'], field: ['Field work & surveys', '⌖', '132,139,78'], installation: ['Installation & commissioning', '⚒', '174,120,74'], presentation: ['Presentations & training', '▣', '71,150,162'], contract: ['Contracts & agreements', '§', '173,96,112'], operations: ['Operations & maintenance', '↻', '115,134,151'] };
  function time(value) {
    const raw = value && typeof value === 'object' ? value.dateTime || value.date : value;
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) { const [y,m,d] = raw.split('-').map(Number); return +new Date(y,m-1,d); }
    return raw ? Date.parse(raw) : NaN;
  }
  function normalize(event) {
    if (!event || (!event.isWorkEvent && !event.work)) return null;
    const start = time(event.dtstart || event.start);
    let end = time(event.dtend || event.end);
    if (!Number.isFinite(start)) return null;
    if (!Number.isFinite(end)) end = start + (event.dtstart?.date ? DAY : 3600000);
    if (event.work?.kind === 'milestone') end = start;
    if (end < start) return null;
    const w = event.work || {};
    return { event, id: event.workRef || event.uid || event.id, start, end,
      project: String(w.project || 'Work'), lane: String(event.category || event.categories?.[0] || w.lane || 'General'),
      workflow: workflows[w.workflow] ? w.workflow : 'communication',
      access: event.workAccess || { label: 'Loaded', canWrite: false },
      assignee: String(w.assignee || ''), followUpAt: time(w.followUpAt),
      links: Array.isArray(w.links) ? w.links : [],
      kind: ['task', 'meeting', 'milestone'].includes(w.kind) ? w.kind : 'meeting',
      status: statuses.includes(w.status) ? w.status : 'planned',
      dependencies: Array.isArray(w.dependencies) ? w.dependencies.filter(x => typeof x === 'string') : [] };
  }
  // Reserve minimum visible card width in time units so nearby meetings never overlap.
  function pack(items, minSpan = 0) {
    const ends = [];
    return [...items].sort((a, b) => a.start - b.start || a.end - b.end).map(item => {
      let row = ends.findIndex(end => end <= item.start);
      if (row < 0) row = ends.length;
      ends[row] = Math.max(item.end, item.start + minSpan);
      return { ...item, row };
    });
  }
  function dependencyState(item, items) {
    const byId = new Map(items.map(x => [x.id, x]));
    return item.dependencies.map(id => ({ id, item: byId.get(id),
      unresolved: !byId.has(id) || byId.get(id).status !== 'done' }));
  }
  function seed() {
    const rows = [
      ['kickoff', 'OpenAMI / ISV kickoff', 'Alignment', 'meeting', 'done', '2026-11-02T17:00:00Z', '2026-11-02T18:00:00Z', []],
      ['scope', 'Agree pilot scope', 'Alignment', 'task', 'done', '2026-11-03T17:00:00Z', '2026-11-05T18:00:00Z', ['kickoff']],
      ['data', 'Map sample meter data', 'Data & interoperability', 'task', 'in-progress', '2026-11-05T17:00:00Z', '2026-11-12T18:00:00Z', ['scope']],
      ['review', 'Interoperability review', 'Data & interoperability', 'meeting', 'planned', '2026-11-12T19:00:00Z', '2026-11-12T20:00:00Z', ['data']],
      ['prototype', 'Build pilot walkthrough', 'Delivery', 'task', 'blocked', '2026-11-10T17:00:00Z', '2026-11-18T18:00:00Z', ['data']],
      ['feedback', 'ISV feedback session', 'Delivery', 'meeting', 'planned', '2026-11-19T17:00:00Z', '2026-11-19T18:00:00Z', ['prototype']],
      ['ready', 'Pilot ready', 'Delivery', 'milestone', 'planned', '2026-11-23T17:00:00Z', '2026-11-23T17:00:00Z', ['review', 'feedback']],
    ];
    return rows.map(([id, summary, lane, kind, status, start, end, dependencies]) => ({
      uid: 'openami-example-' + id, summary, isWorkEvent: true, category: lane,
      description: 'Illustrative planning example, not a confirmed commitment or report of project progress.',
      dtstart: { dateTime: start }, ...(kind === 'milestone' ? {} : { dtend: { dateTime: end } }),
      work: { project: 'OpenAMI / ISV', lane, kind, status, workflow: lane === 'Alignment' ? 'communication' : lane === 'Delivery' ? 'ai-code' : 'cloud', assignee: lane === 'Data & interoperability' ? 'Data team' : 'Project team', dependencies: dependencies.map(x => 'openami-example-' + x) }
    }));
  }
  function semantic(item, now = Date.now()) {
    if (item.status === 'blocked' || item.status === 'cancelled' || item.event.status === 'CANCELLED') return 'blocked';
    if (item.status === 'waiting') return 'waiting';
    if (item.status === 'done') return item.kind === 'milestone' ? 'milestone-done' : 'completed';
    if (item.status === 'todo' || item.status === 'in-progress') return 'action';
    if (item.status === 'no-outcome' || item.end < now) return 'past';
    return 'upcoming';
  }
  function ticks(start, end, zoom) {
    const result = [], d = new Date(start);
    if (zoom === 'month' || zoom === 'quarter' || zoom === 'week') {
      d.setHours(0,0,0,0);
      if (zoom !== 'week') d.setDate(d.getDate() + (8-d.getDay())%7);
      if (+d < start) d.setDate(d.getDate() + (zoom === 'week' ? 1 : 7));
      while (+d < end && result.length < 100) { result.push(+d); d.setDate(d.getDate() + (zoom === 'week' ? 1 : 7)); }
    } else if (zoom === 'year') {
      d.setDate(1);d.setHours(0,0,0,0);if (+d<start)d.setMonth(d.getMonth()+1);
      while(+d<end&&result.length<100){result.push(+d);d.setMonth(d.getMonth()+1);}
    } else {
      const step = Math.max(3600000, (end-start)/8);let t=Math.ceil(start/step)*step;
      while(t<end&&result.length<100){result.push(t);t+=step;}
    }
    return result;
  }
  function cycle(target, dependencies, items) {
    const graph = new Map(items.map(e=>[e.id,e.dependencies]));graph.set(target,dependencies);
    function visit(id, seen = new Set()) { if(id===target)return true;if(seen.has(id))return false;seen.add(id);return (graph.get(id)||[]).some(x=>visit(x,seen)); }
    return dependencies.some(id=>visit(id));
  }
  function report(items, now=Date.now()) {
    const outgoing=new Set(items.flatMap(e=>e.dependencies));
    return items.map(e=>({...e, unresolved:dependencyState(e,items).filter(d=>d.unresolved).length,
      overdue: !['done','cancelled','no-outcome'].includes(e.status) && e.end < now,
      followUpDue: Number.isFinite(e.followUpAt) && e.followUpAt <= now && !['done','cancelled'].includes(e.status),
      noFollowUp: e.kind==='meeting' && e.end<now && !outgoing.has(e.id) && !['cancelled','no-outcome'].includes(e.status)}));
  }
  const api = { DAY, statuses, workflows, time, normalize, pack, dependencyState, seed, semantic, ticks, cycle, report };
  if (typeof module !== 'undefined') module.exports = api;
  root.WorkTimeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
