const assert = require('node:assert/strict');
const M = require('./work-mode.js');
const now = Date.parse('2026-11-07T18:00:00Z');
const tasks = M.seed(now);

assert.deepEqual(M.CATEGORIES.map(c => c.id), ['research', 'development', 'delivery']);
assert.equal(M.normalize({ title: 'x', category: 'stage' }), null);
assert.equal(M.normalize({ title: '', category: 'research' }), null);

const research = M.nextTask(tasks, 'research', null);
assert.equal(research.id, 'wm-scope');
assert.match(M.why(research, tasks), /Already active/);
assert.match(M.why(research, tasks), /High priority/);

assert.equal(M.nextTask(tasks, 'development', 15), null, '90 min task stays out of a 15 min window');
assert.equal(M.nextTask(tasks, 'delivery', 15), null);
assert.equal(M.nextTask(tasks, 'delivery', 30).id, 'wm-review');
assert.equal(M.nextTask(tasks, 'delivery', null).id, 'wm-review');

const pinned = M.setNext(tasks, 'wm-ready');
assert.equal(M.rank(pinned, 'delivery', null)[0].id, 'wm-ready');
assert.equal(M.nextTask(pinned, 'delivery', null).id, 'wm-review', 'pinned task stays blocked by its dependency');

const done = tasks.map(t => t.id === 'wm-scope' ? M.complete(t, now) : t);
assert.equal(done.find(t => t.id === 'wm-scope').status, 'completed');
assert.ok(done.find(t => t.id === 'wm-scope').completedAt);
assert.equal(M.nextTask(done, 'development', null).id, 'wm-data', 'finishing the dependency reveals the next build task');
assert.equal(M.reopen(done.find(t => t.id === 'wm-scope'), now).status, 'active');
assert.equal(M.reopen(done.find(t => t.id === 'wm-scope'), now).completedAt, null);

const report = M.progress(done, now);
assert.equal(report.today >= 1, true);
assert.equal(report.recent.id, 'wm-scope');
assert.equal(report.remaining, tasks.length - 2);

const context = M.recall(done, 'OpenAMI / ISV');
assert.equal(context.last.id, 'wm-scope');
assert.equal(context.next.id, 'wm-data');
assert.match(context.blocker, /sample data|Build pilot/);
assert.equal(context.milestone, 'Pilot ready');

const moved = M.move(tasks, 'wm-ready', -1);
assert.ok(moved.find(t => t.id === 'wm-ready').order < tasks.find(t => t.id === 'wm-ready').order || moved.find(t => t.id === 'wm-review').order !== tasks.find(t => t.id === 'wm-review').order);

console.log('Work mode: categories, next task, time filter, complete, reopen, recall passed');
